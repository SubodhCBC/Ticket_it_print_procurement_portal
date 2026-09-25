-- Before and after values on every audit entry (SOW O-7 and §12: "immutable log
-- of every entity mutation capturing actor, entity, action, before and after
-- values and timestamp ... searchable with a difference view").
--
--   audit_log_entries.beforeValues   the changed fields as they were
--   audit_log_entries.afterValues    the same fields as they became
--   audit_log_entries.changedFields  '|name|status|' — the keys of either side
--
-- ---------------------------------------------------------------------------
-- Why columns, and not the details blob
-- ---------------------------------------------------------------------------
-- Until now a change went into `details` in whatever shape the calling service
-- chose: `{ from, to }` for one field, `{ changes: dto }` — the request, with no
-- before value at all — or a hand-rolled diff in two services. A difference view
-- cannot be built over four shapes, and "every entry that changed basePrice"
-- cannot be asked of any of them. Two fixed columns written by one function
-- make the shape a property of the table rather than of each caller's habits.
-- `details` stays, for context that is not a field change.
--
-- Only changed fields are stored, on both sides. A full row image on every
-- entry would multiply a log that is kept for seven years by the width of the
-- widest table, to record values that did not move.
--
-- `changedFields` exists so the explorer can filter by field with an exact
-- token match — LIKE '%|basePrice|%' — rather than searching inside JSON. No
-- index: a leading-wildcard LIKE cannot use one, and every audit read is already
-- narrowed by the (accountId, createdAt) index first.
--
-- ---------------------------------------------------------------------------
-- Existing rows
-- ---------------------------------------------------------------------------
-- All three stay NULL. There is nothing trustworthy to backfill from: most old
-- entries recorded the requested change with no before value, and reading a
-- field name out of `{ from, to }` would mean guessing it from the action name.
-- NULL is how the view tells "not captured" apart from "captured, nothing
-- changed", and an invented before value in an audit trail would be worse than
-- an honest gap.
--
-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- No new table. audit_log_entries is guarded by rls_fn_account_predicate on
-- accountId alone, so adding columns and checks is allowed, as in 20260916180000.
-- The checks run through EXEC because SQL Server compiles the whole batch before
-- running any of it, and a constraint naming a column added in the same batch
-- fails to compile otherwise.
--
-- Hand-written, like every migration since 20260908070000. Apply with
-- `prisma migrate deploy`, then `npm run verify:schema`:
--
--   ISJSON checks   22 -> 24

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[audit_log_entries] ADD
    [beforeValues] NVARCHAR(max) NULL,
    [afterValues] NVARCHAR(max) NULL,
    [changedFields] NVARCHAR(4000) NULL;

EXEC('ALTER TABLE [dbo].[audit_log_entries] ADD CONSTRAINT [audit_log_entries_beforeValues_is_json]
  CHECK ([beforeValues] IS NULL OR ISJSON([beforeValues]) = 1)');

EXEC('ALTER TABLE [dbo].[audit_log_entries] ADD CONSTRAINT [audit_log_entries_afterValues_is_json]
  CHECK ([afterValues] IS NULL OR ISJSON([afterValues]) = 1)');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
