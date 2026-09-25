-- A free-text customer reference (SOW F-14: "PO number / customer reference —
-- ... free-text customer reference also captured"), carried from checkout to
-- the order and onto the billing backing file (B-05: "PO number and customer
-- reference").
--
--   carts.customerReference          saved by the checkout stepper
--   orders.customerReference         copied from the cart at placement
--   invoice_lines.customerReference  copied from the order at generation
--
-- Nullable, no default, no check: every existing row stays NULL, which is the
-- truth — nobody was asked for one. Unlike the PO it follows no account format
-- rule, so there is nothing for a constraint to hold.
--
-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- No new table, so the policy is untouched. `carts` and `orders` are reached by
-- schema-bound predicate functions (rls_fn_cart_line_predicate,
-- rls_fn_order_child_predicate), but schema binding only forbids changes to the
-- columns those functions read. Adding a column is not one — 20260911000000
-- added carts.shippingMethod and orders.shippingMethod the same way.
--
-- ---------------------------------------------------------------------------
-- Why this is hand-written
-- ---------------------------------------------------------------------------
-- The same reason as 20260908070000: `prisma migrate dev` reads the UTC column
-- defaults and filtered unique indexes elsewhere as drift and offers to undo
-- them. Apply with `prisma migrate deploy`. `verify:schema` counts do not move:
-- no table, predicate, default or check is added.

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[carts] ADD [customerReference] NVARCHAR(200) NULL;
ALTER TABLE [dbo].[orders] ADD [customerReference] NVARCHAR(200) NULL;
ALTER TABLE [dbo].[invoice_lines] ADD [customerReference] NVARCHAR(200) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
