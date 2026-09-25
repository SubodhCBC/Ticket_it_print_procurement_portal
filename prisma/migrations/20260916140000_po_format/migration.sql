-- A configurable purchase-order format (SOW F-14: "validated against a
-- configurable format rule"; AD-8: "per-account ... PO format rule").
--
--   accounts.poFormat   the account-wide format, e.g. PO-####-YY
--   sites.poFormat      a branch's own format, which wins when set
--
-- Nullable, no default: every existing account and site keeps exactly the rule
-- it has today, which is no format. The grammar lives in src/lib/po-format.ts
-- and is checked on write by the application, not by a constraint — a CHECK
-- would have to reimplement the parser in T-SQL and drift from it.
--
-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- No new table, so the policy is untouched. Both tables carry account
-- predicates that read the session context, not these columns, and adding a
-- column is not a change schema binding forbids — see 20260916160000.
--
-- ---------------------------------------------------------------------------
-- Ordering
-- ---------------------------------------------------------------------------
-- Timestamped before 20260916160000_customer_reference, which may already be
-- applied where this lands. `prisma migrate deploy` applies whatever has not
-- been, and the two touch different tables, so the order does not matter.
--
-- Hand-written for the same reason as 20260908070000. Apply with
-- `prisma migrate deploy`; `verify:schema` counts do not move.

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[accounts] ADD [poFormat] NVARCHAR(64) NULL;
ALTER TABLE [dbo].[sites] ADD [poFormat] NVARCHAR(64) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
