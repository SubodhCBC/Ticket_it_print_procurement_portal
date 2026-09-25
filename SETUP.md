# Setting up a development machine

From a fresh clone to a signed-in portal. Steps 1–4 give an empty database with
the demo data; [Bringing data from another machine](#bringing-data-from-another-machine)
carries real orders, users and uploaded files across.

## 1. Install

- **Docker Desktop**
- **Node 22** — the Dockerfile builds on `node:22`
- **Git**

The SQL Server image is x86-64 only. Windows and Linux PCs run it as-is; on an
Apple Silicon Mac, turn on _Use Rosetta for x86_64/amd64 emulation_ in Docker
Desktop's settings first.

These host ports must be free: `51433` (SQL Server), `6379` (Redis), `9000` and
`9001` (MinIO), `1025` and `8025` (Mailpit). `6379` is the usual collision — a
Redis already installed on the machine will be holding it.

## 2. Start the services

```bash
git clone https://github.com/deepakcreativebuffer/PrintProcurementPortal.git
cd PrintProcurementPortal
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml ps -a
```

`sqlserver-init` and `minio-init` run once and stop, and both should show
`Exited (0)`: the first creates the `ticketit` database and its login, the second
the `ticketit-assets` bucket. If either shows another code, read its log
(`docker logs ticketit-sqlserver-init`). SQL Server is slow on a cold start, so
give it a minute or two before deciding it failed.

## 3. Create `.env`

```bash
cp .env.example .env
```

Everything local works with the example values except two:

- **`LEGACY_DATABASE_URL`** is a placeholder (`sqlserver://HOST:1433;…`). It
  points at the legacy Ticket-IT database, which sign-in falls back to for a
  user the portal has not seen yet, or whose local password check fails. Copy
  the real value from a teammate's `.env` over a private channel — it is a
  credential — or, without access to that database, set
  `LEGACY_AUTH_FALLBACK_ENABLED=false`. The seeded dev users sign in either way.
- **`PORTAL_BASE_URL`** is the base of every emailed link. `npm run dev` serves
  on port 3000, so set it to `http://localhost:3000`.

## 4. Install, migrate, seed, run

```bash
npm ci                 # also runs prisma generate, for both clients
npm run db:deploy      # applies the migrations
npm run verify:schema  # confirms what Prisma cannot see survived
npm run db:seed        # dev users, catalogue and pricing
```

Then, in two terminals:

```bash
npm run dev            # http://localhost:3000
npm run worker:dev     # emails, imports, image renders
```

Sign in as `dev.admin`, `dev.headoffice` or `dev.siteuser`, password
`Password123!`. The field takes the username, not an email address.

> **Never run `npm run db:migrate`** (`prisma migrate dev`). The schema carries
> filtered unique indexes, UTC column defaults, Row-Level Security and
> constraints that `schema.prisma` cannot express. `migrate dev` reads them as
> drift and removes them, quietly, and nothing errors afterwards — the app just
> answers wrongly. Use `db:deploy`, and run `verify:schema` after any migration.

## What runs where

| Service             | Address                                | Credentials                                         |
| ------------------- | -------------------------------------- | --------------------------------------------------- |
| Portal              | http://localhost:3000                  | the dev users above                                 |
| SQL Server          | `localhost,51433`, database `ticketit` | `ticketit` / `Ticketit_Local_2026!`; `sa`, the same |
| MinIO console       | http://localhost:9001                  | `minioadmin` / `minioadmin`                         |
| Mailpit (sent mail) | http://localhost:8025                  | —                                                   |
| Redis               | `localhost:6379`                       | —                                                   |

## Bringing data from another machine

To carry the current orders, users and uploaded files (product images, artwork,
invoices), two things move: the `ticketit` database and the MinIO volume. Redis
stays behind — it holds only the reporting cache and queued jobs.

**On the old machine**, with the services running:

```bash
npm run data:backup
```

This writes `backups/<timestamp>/`, holding `ticketit.bak`, `minio.tgz` and a
`manifest.json` recording the commit and the last applied migration. The app can
keep running meanwhile. The directory holds real users, password hashes and
orders: it is git-ignored, and it should travel by USB or a private share.

**On the new machine**, do steps 1–3 and step 4 up to `npm ci` — no `db:seed`.
Copy the backup directory into the repository, make sure `npm run dev` and the
worker are not running, then:

```bash
npm run data:restore -- backups/<timestamp>
npm run db:deploy
npm run verify:schema
```

The restore asks before it replaces the database and every file in MinIO, and
refuses while anything is connected to the database or when the backup was
taken on newer code than this checkout. Beyond restoring, it:

- **rebinds the database user `ticketit` to this machine's login.** A restored
  user stays tied to the old server's login, and the app's connection then fails
  with an error that looks exactly like a wrong password;
- **switches read-committed snapshot on**, without which checkout can deadlock.

`db:deploy` then applies whatever migrations are newer than the backup. Never
run `db:seed` on a restored database.

## When something is wrong

- **Sign-in fails with a password error, and the password is right.** Check that
  `DATABASE_URL` uses port `51433` — a SQL Server installed on the machine owns
  `1433` — and that a database restored by hand had its user rebound (above).
- **`docker compose up` says a port is already allocated.** Stop whatever holds
  it (`netstat -ano | findstr :6379` on Windows, `lsof -i :6379` elsewhere), or
  change the host side of that port in `docker/docker-compose.yml` and the
  matching URL in `.env`.
- **`ticketit-sqlserver` never turns healthy on a Mac.** Rosetta emulation is
  off; see step 1.
- **A change to `.env` did nothing.** It is read once at startup: restart
  `npm run dev` and the worker.

## Running the app itself in Docker

The compose file holds only the services; the app runs on the host for fast
reload. For a server, the `Dockerfile` builds one image that runs all three
roles — `next start` by default, `npm run worker`, and
`npx prisma migrate deploy` as a job before the other two. There is no compose
service for it yet.
