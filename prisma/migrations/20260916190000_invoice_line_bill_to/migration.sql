-- The bill-to on each invoice line (SOW F-15: "snapshotted onto the order and
-- invoice"; B-09: the backing file carries "bill-to address").
--
--   invoice_lines.billingSnapshot   copied from orders.billingSnapshot when the
--                                   invoice is generated
--
-- Per line rather than per invoice: an invoice is one account for one month, and
-- its orders can have been billed to different addresses — a branch's own, or
-- head office's. Collapsing them to one would print a bill-to some lines were
-- never billed to.
--
-- Nullable, and existing lines stay NULL. A draft picks the value up the next
-- time it is generated; an issued or paid invoice is not regenerated, so its
-- lines keep NULL, which is the truth about what that invoice said.
--
-- `invoice_lines_billingSnapshot_is_json` matches the order's check. It runs
-- through EXEC because SQL Server compiles the batch before the column exists.
--
-- No new table, so row-level security is untouched: rls_fn_invoice_line_predicate
-- binds `invoices`, not this table's shape (see 20260916160000).
--
-- Hand-written for the same reason as 20260908070000. Apply with
-- `prisma migrate deploy`, then `npm run verify:schema`:
--
--   ISJSON checks   21 -> 22

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[invoice_lines] ADD [billingSnapshot] NVARCHAR(max) NULL;

EXEC('ALTER TABLE [dbo].[invoice_lines] ADD CONSTRAINT [invoice_lines_billingSnapshot_is_json]
  CHECK ([billingSnapshot] IS NULL OR ISJSON([billingSnapshot]) = 1)');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
