-- Column defaults on the timestamp columns must be UTC.
--
-- ---------------------------------------------------------------------------
-- What was wrong
-- ---------------------------------------------------------------------------
-- Prisma renders `@default(now())` as `DEFAULT (getdate())`. GETDATE() returns a
-- DATETIME2 in the *server's local time* carrying no offset at all, and
-- assigning a value with no offset to a DATETIMEOFFSET column labels it +00:00.
-- So on any server whose clock is not UTC, the default records local wall-clock
-- time and claims it is UTC.
--
-- Measured rather than assumed. On a server set to India Standard Time:
--
--     true instant                   2026-09-08T04:55:22Z
--     what GETDATE() would store     2026-09-08T10:25:21Z
--     error                          330 minutes
--
-- Nothing complains. The row is written, the column is the right type, and every
-- reader downstream believes the timestamp. It is invisible on a UTC server,
-- which is what the local container is, so it would have survived every test
-- here and appeared only in production.
--
-- ---------------------------------------------------------------------------
-- How much it actually bites
-- ---------------------------------------------------------------------------
-- Less than it might. Prisma sends `createdAt` explicitly on every insert rather
-- than leaning on the column default -- confirmed by reading the generated
-- INSERT -- so the application path was never affected. What the default covers
-- is everything else: raw SQL, a seed or backfill script, and the hand-run
-- INSERT a DBA does at two in the morning. Those are exactly the moments nobody
-- is checking a timezone.
--
-- The rest of the timestamp surface was audited and is already correct: every
-- date derivation in the application uses getUTC*/Date.UTC, report ranges are
-- bound as parameters rather than interpolated, and the only date function in
-- any raw query is the invoice sequence's own TODATETIMEOFFSET(SYSUTCDATETIME(), 0).
--
-- ---------------------------------------------------------------------------
-- Why this is written as a loop
-- ---------------------------------------------------------------------------
-- The criterion is what matters, not the list: *every* DATETIMEOFFSET column
-- whose default is GETDATE(). Enumerating 36 of them invites the list and the
-- database to drift, and a column added later with the same fault would not be
-- caught by a static script that has already run.
--
-- SYSUTCDATETIME() rather than SYSDATETIMEOFFSET(): both record the same
-- instant, but the first lands every row on +00:00 so the whole column reads
-- back uniformly, and a raw query that casts to DATE or groups by month does not
-- have to think about which offset a particular row happens to carry.
--
-- ---------------------------------------------------------------------------
-- Prisma will want to undo this
-- ---------------------------------------------------------------------------
-- `@default(now())` still means GETDATE() to Prisma, so `migrate dev` reads
-- these as drift and will offer to put them back. Like the filtered indexes in
-- 20260907160000, this has to be reapplied after any regeneration -- there is no
-- schema syntax that says "UTC".

DECLARE @sql NVARCHAR(MAX) = N'';

SELECT @sql = @sql
  + N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(o.schema_id)) + N'.' + QUOTENAME(o.name)
  + N' DROP CONSTRAINT ' + QUOTENAME(d.name) + N';'
  + N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(o.schema_id)) + N'.' + QUOTENAME(o.name)
  + N' ADD CONSTRAINT ' + QUOTENAME(d.name)
  + N' DEFAULT SYSUTCDATETIME() FOR ' + QUOTENAME(c.name) + N';'
FROM sys.default_constraints d
JOIN sys.objects o ON o.object_id = d.parent_object_id
JOIN sys.columns c
  ON c.object_id = d.parent_object_id
 AND c.column_id = d.parent_column_id
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE t.name = 'datetimeoffset'
  AND d.definition LIKE '%getdate%'
  -- Prisma's own bookkeeping table is not ours to alter.
  AND o.name <> '_prisma_migrations';

EXEC sp_executesql @sql;
