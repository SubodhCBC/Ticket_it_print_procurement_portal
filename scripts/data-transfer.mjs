/**
 * Carries a local environment's data — the database and the uploaded files —
 * to another machine.
 *
 *   npm run data:backup                              # writes backups/<timestamp>/
 *   npm run data:restore -- backups/<timestamp>      # on the other machine
 *
 * Needs Docker and nothing else: sqlcmd and tar run inside the containers
 * docker/docker-compose.yml already starts, so neither machine needs SQL Server
 * tools installed. It is a Node script rather than a shell one so it behaves the
 * same from PowerShell, bash and zsh — the one-liners it replaces were different
 * on each, and a binary piped through Windows PowerShell's stdout arrives
 * corrupted.
 *
 * A backup directory holds real users, password hashes and orders. It is
 * git-ignored; move it by USB or a private share.
 *
 * ---------------------------------------------------------------------------
 * What a restore fixes that RESTORE DATABASE alone does not
 * ---------------------------------------------------------------------------
 * The database user `ticketit` is tied to its server login by SID, and the login
 * on the target machine was created by sqlserver-init with a SID of its own. A
 * restored database therefore carries an orphaned user, and the application's
 * connection is refused with an error that reads exactly like a wrong password.
 * The restore rebinds the user to the local login.
 *
 * Read-committed snapshot is switched on again too. A backup from this compose
 * setup already has it; one from anywhere else may not, and without it checkout
 * deadlocks under concurrency (see docker/docker-compose.yml).
 *
 * The schema is left alone. `npm run db:deploy` afterwards applies only the
 * migrations newer than the backup.
 *
 * Redis is not carried. It holds the reporting cache and queued jobs, and a job
 * queued on the source machine refers to rows as they were there.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

// Overridable so a restore can be rehearsed against throwaway containers
// before it is pointed at the real ones.
const SQL_CONTAINER = process.env.SQLSERVER_CONTAINER ?? 'ticketit-sqlserver'
const MINIO_CONTAINER = process.env.MINIO_CONTAINER ?? 'ticketit-minio'

const DATABASE = 'ticketit'
const APP_LOGIN = 'ticketit'

// Already pulled for docker-compose.yml, and it carries busybox tar, so a
// transfer needs no image the machine does not already have.
const TAR_IMAGE = 'redis:7.4-alpine'
const HELPER = 'ticketit-data-transfer'

const DB_FILE = 'ticketit.bak'
const FILES_ARCHIVE = 'minio.tgz'
const MANIFEST = 'manifest.json'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

function docker(args, { cwd, env, allowFailure = false } = {}) {
  const run = spawnSync('docker', args, {
    cwd,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  })
  if (run.error) {
    throw new Error(
      `could not run docker (${run.error.message}). Is Docker Desktop running?`
    )
  }
  if (run.status !== 0 && !allowFailure) {
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim()
    throw new Error(`docker ${args.slice(0, 2).join(' ')} failed:\n${output}`)
  }
  return run
}

/**
 * Runs T-SQL as `sa` inside the SQL Server container.
 *
 * The statement travels as an environment variable rather than an argument, so
 * no shell on either side re-reads its quotes, and the password is the one the
 * container was started with rather than a second copy kept here.
 */
function sql(statement, { database = 'master', allowFailure = false } = {}) {
  const run = docker(
    [
      'exec',
      '-e',
      'SQL',
      SQL_CONTAINER,
      'bash',
      '-c',
      `/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -b -h -1 -W -d ${database} -Q "SET NOCOUNT ON; $SQL"`,
    ],
    { env: { SQL: statement }, allowFailure }
  )
  return run.stdout.trim()
}

function requireRunning(container) {
  const run = docker(
    ['inspect', '-f', '{{.State.Running}} {{.State.Paused}}', container],
    {
      allowFailure: true,
    }
  )
  const [running, paused] = run.stdout.trim().split(' ')
  if (run.status !== 0 || running !== 'true') {
    throw new Error(
      `container ${container} is not running. Start the services first:\n` +
        '  docker compose -f docker/docker-compose.yml up -d'
    )
  }
  // Only an interrupted backup leaves MinIO paused.
  if (paused === 'true') {
    throw new Error(
      `container ${container} is paused. Resume it with:\n  docker unpause ${container}`
    )
  }
}

function minioVolume() {
  const name = docker([
    'inspect',
    '-f',
    '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}',
    MINIO_CONTAINER,
  ]).stdout.trim()
  if (!name)
    throw new Error(
      `${MINIO_CONTAINER} keeps /data somewhere other than a named volume`
    )
  return name
}

const removeHelper = () => docker(['rm', '-f', HELPER], { allowFailure: true })

const size = (file) => `${(statSync(file).size / 1024 / 1024).toFixed(1)} MB`

function backup(target) {
  requireRunning(SQL_CONTAINER)
  requireRunning(MINIO_CONTAINER)

  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', '_')
    .replace(/:/g, '')
  const dir = target
    ? path.resolve(target)
    : path.join(repoRoot, 'backups', stamp)
  if (
    existsSync(path.join(dir, DB_FILE)) ||
    existsSync(path.join(dir, FILES_ARCHIVE))
  ) {
    throw new Error(`${dir} already holds a backup; name a new directory`)
  }
  mkdirSync(dir, { recursive: true })

  // COPY_ONLY leaves the source's own backup chain as it was. CHECKSUM has the
  // restore verify every page rather than trust a file that crossed a USB stick.
  console.log(`database  backing up [${DATABASE}]`)
  const staged = `/tmp/${DB_FILE}`
  try {
    sql(
      `BACKUP DATABASE [${DATABASE}] TO DISK = '${staged}' WITH INIT, COPY_ONLY, COMPRESSION, CHECKSUM;`
    )
    docker(['cp', `${SQL_CONTAINER}:${staged}`, DB_FILE], { cwd: dir })
  } finally {
    docker(['exec', '-u', '0', SQL_CONTAINER, 'rm', '-f', staged], {
      allowFailure: true,
    })
  }

  const lastMigration = sql(
    'SELECT TOP 1 migration_name FROM _prisma_migrations ' +
      'WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY finished_at DESC;',
    { database: DATABASE }
  )

  const volume = minioVolume()
  console.log(`files     archiving volume ${volume}`)
  removeHelper()
  // Paused rather than stopped: nothing is written mid-archive, and MinIO
  // answers again the moment the archive is taken.
  docker(['pause', MINIO_CONTAINER])
  try {
    docker([
      'run',
      '--name',
      HELPER,
      '-v',
      `${volume}:/data:ro`,
      '--entrypoint',
      'tar',
      TAR_IMAGE,
      'czf',
      `/${FILES_ARCHIVE}`,
      '-C',
      '/data',
      '.',
    ])
    docker(['cp', `${HELPER}:/${FILES_ARCHIVE}`, FILES_ARCHIVE], { cwd: dir })
  } finally {
    docker(['unpause', MINIO_CONTAINER], { allowFailure: true })
    removeHelper()
  }

  const git = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const manifest = {
    createdAt: new Date().toISOString(),
    database: DATABASE,
    lastMigration,
    gitCommit: git.status === 0 ? git.stdout.trim() : null,
  }
  writeFileSync(
    path.join(dir, MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`
  )

  console.log(`
backup written to ${dir}
  ${DB_FILE.padEnd(14)}${size(path.join(dir, DB_FILE))}
  ${FILES_ARCHIVE.padEnd(14)}${size(path.join(dir, FILES_ARCHIVE))}
  last migration ${lastMigration}

It holds real users, password hashes and orders. Move it by USB or a private
share, never through git. Copy it to backups/ in the repository on the other
machine, then:
  npm run data:restore -- backups/${path.basename(dir)}`)
}

async function confirm(lines, yes) {
  console.log(lines.join('\n'))
  if (yes) return
  if (!process.stdin.isTTY) {
    throw new Error(
      'refusing to overwrite without a terminal to confirm in; pass --yes'
    )
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const answer = await prompt.question('\nType "yes" to continue: ')
  prompt.close()
  if (answer.trim().toLowerCase() !== 'yes')
    throw new Error('cancelled; nothing was changed')
}

function restoreDatabase(dir) {
  const staged = '/tmp/ticketit-restore.bak'
  console.log(`database  restoring [${DATABASE}]`)
  docker(['cp', DB_FILE, `${SQL_CONTAINER}:${staged}`], { cwd: dir })
  try {
    sql(
      `IF DB_ID('${DATABASE}') IS NOT NULL ALTER DATABASE [${DATABASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; ` +
        `RESTORE DATABASE [${DATABASE}] FROM DISK = '${staged}' WITH REPLACE;`
    )
  } finally {
    // A failed restore must not leave the old database locked to one user.
    sql(
      `IF EXISTS (SELECT 1 FROM sys.databases WHERE name = '${DATABASE}' ` +
        `AND state_desc = 'ONLINE' AND user_access_desc <> 'MULTI_USER') ` +
        `ALTER DATABASE [${DATABASE}] SET MULTI_USER;`,
      { allowFailure: true }
    )
    docker(['exec', '-u', '0', SQL_CONTAINER, 'rm', '-f', staged], {
      allowFailure: true,
    })
  }

  // The orphaned user and read-committed snapshot; see the header.
  sql(
    `IF USER_ID('${APP_LOGIN}') IS NULL BEGIN CREATE USER [${APP_LOGIN}] FOR LOGIN [${APP_LOGIN}] END ` +
      `ELSE BEGIN ALTER USER [${APP_LOGIN}] WITH LOGIN = [${APP_LOGIN}] END; ` +
      `ALTER ROLE db_owner ADD MEMBER [${APP_LOGIN}];`,
    { database: DATABASE }
  )
  sql(
    `ALTER DATABASE [${DATABASE}] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;`
  )

  const bound = sql(
    `SELECT CASE WHEN sid = SUSER_SID('${APP_LOGIN}') THEN 1 ELSE 0 END ` +
      `FROM sys.database_principals WHERE name = '${APP_LOGIN}';`,
    { database: DATABASE }
  )
  const snapshot = sql(
    `SELECT CAST(is_read_committed_snapshot_on AS INT) FROM sys.databases WHERE name = '${DATABASE}';`
  )
  if (bound !== '1' || snapshot !== '1') {
    throw new Error(
      `restored, but the checks after it failed: user bound to login = ${bound}, ` +
        `read-committed snapshot = ${snapshot} (both should be 1)`
    )
  }
  console.log(
    `          user ${APP_LOGIN} bound to this server's login, read-committed snapshot on`
  )
}

function restoreFiles(dir) {
  const volume = minioVolume()
  console.log(`files     replacing volume ${volume}`)
  removeHelper()
  // Everything goes, .minio.sys included: MinIO's metadata from two machines
  // mixed in one volume describes objects neither of them has.
  docker([
    'create',
    '--name',
    HELPER,
    '-v',
    `${volume}:/data`,
    '--entrypoint',
    'sh',
    TAR_IMAGE,
    '-c',
    `rm -rf /data/..?* /data/.[!.]* /data/* && tar xzf /${FILES_ARCHIVE} -C /data`,
  ])
  try {
    docker(['cp', FILES_ARCHIVE, `${HELPER}:/${FILES_ARCHIVE}`], { cwd: dir })
    docker(['stop', MINIO_CONTAINER])
    docker(['start', '-a', HELPER], { allowFailure: true })
    const exitCode = docker([
      'inspect',
      '-f',
      '{{.State.ExitCode}}',
      HELPER,
    ]).stdout.trim()
    if (exitCode !== '0') {
      const logs = docker(['logs', HELPER], { allowFailure: true })
      throw new Error(
        `extracting ${FILES_ARCHIVE} failed:\n${`${logs.stdout}${logs.stderr}`.trim()}`
      )
    }
  } finally {
    removeHelper()
    docker(['start', MINIO_CONTAINER], { allowFailure: true })
  }
}

async function restore(source, { yes }) {
  if (!source)
    throw new Error('usage: npm run data:restore -- <backup directory> [--yes]')

  const dir = path.resolve(source)
  const hasDatabase = existsSync(path.join(dir, DB_FILE))
  const hasFiles = existsSync(path.join(dir, FILES_ARCHIVE))
  if (!hasDatabase && !hasFiles) {
    throw new Error(`${dir} holds neither ${DB_FILE} nor ${FILES_ARCHIVE}`)
  }

  const manifestPath = path.join(dir, MANIFEST)
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : null

  // Newer data than code: the app would run against columns it does not know.
  if (hasDatabase && manifest?.lastMigration) {
    const local = readdirSync(path.join(repoRoot, 'prisma', 'migrations'))
    if (!local.includes(manifest.lastMigration)) {
      const commit = manifest.gitCommit
        ? ` (commit ${manifest.gitCommit.slice(0, 7)})`
        : ''
      throw new Error(
        `the backup's schema is newer than this checkout: its last migration, ` +
          `${manifest.lastMigration}, is not in prisma/migrations. ` +
          `Pull the code it was taken from${commit} first.`
      )
    }
  }

  if (hasDatabase) {
    requireRunning(SQL_CONTAINER)

    const login = sql(
      `SELECT CASE WHEN SUSER_ID('${APP_LOGIN}') IS NULL THEN 0 ELSE 1 END;`
    )
    if (login !== '1') {
      throw new Error(
        `the ${APP_LOGIN} login does not exist on ${SQL_CONTAINER}. sqlserver-init creates it: ` +
          'run docker compose -f docker/docker-compose.yml up -d and check that ' +
          'ticketit-sqlserver-init exited with code 0.'
      )
    }

    const connections = sql(
      `SELECT COUNT(*) FROM sys.dm_exec_sessions ` +
        `WHERE database_id = DB_ID('${DATABASE}') AND session_id <> @@SPID;`
    )
    if (connections !== '0') {
      throw new Error(
        `${connections} connection(s) are open to [${DATABASE}]. Stop npm run dev, ` +
          'npm run worker:dev and anything else using it (Prisma Studio, a SQL client), ' +
          'then run this again.'
      )
    }
  }
  if (hasFiles) requireRunning(MINIO_CONTAINER)

  await confirm(
    [
      `restoring from ${dir}`,
      ...(manifest
        ? [
            `  taken ${manifest.createdAt}, last migration ${manifest.lastMigration}`,
          ]
        : []),
      '',
      'This replaces, on this machine:',
      ...(hasDatabase
        ? [`  - the [${DATABASE}] database on ${SQL_CONTAINER}`]
        : []),
      ...(hasFiles ? [`  - every file in MinIO (${MINIO_CONTAINER})`] : []),
    ],
    yes
  )
  console.log()

  if (hasDatabase) restoreDatabase(dir)
  if (hasFiles) restoreFiles(dir)

  console.log(`
restore complete. Next, from the repository root:
  npm run db:deploy       applies any migration newer than the backup
  npm run verify:schema
Do not run db:seed: it writes the demo users and catalogue over the restored data.`)
}

const [command, ...rest] = process.argv.slice(2)
const flags = new Set(rest.filter((arg) => arg.startsWith('--')))
const [target] = rest.filter((arg) => !arg.startsWith('--'))

try {
  if (command === 'backup') {
    backup(target)
  } else if (command === 'restore') {
    await restore(target, { yes: flags.has('--yes') })
  } else {
    console.log(
      'usage:\n' +
        '  node scripts/data-transfer.mjs backup [directory]\n' +
        '  node scripts/data-transfer.mjs restore <directory> [--yes]'
    )
    process.exit(command ? 1 : 0)
  }
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
