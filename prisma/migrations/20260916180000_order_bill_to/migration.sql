-- The bill-to, captured on the order (SOW F-15: "Bill-to address — held against
-- the site, defaulted at checkout, snapshotted onto the order and invoice").
--
--   orders.billingAddressId  the address row it came from, for the UI to link to
--   orders.billingSnapshot   the address as it was, frozen like shippingSnapshot
--
-- Both nullable, and every existing order stays NULL. There is nothing to
-- backfill from: the basket's billing address was never copied, the basket may
-- be gone, and "the branch's billing address today" is not what a past order was
-- billed to. An invented bill-to on a historical order would be worse than none.
--
-- The foreign key is NO ACTION, like shippingAddressId: addresses are soft
-- deleted, and a row an order points at must not take the order with it.
-- `orders_billingSnapshot_is_json` matches `orders_shippingSnapshot_is_json`,
-- relaxed for NULL.
--
-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- No new table. `orders` is read by the schema-bound rls_fn_order_child_predicate,
-- which binds the columns it reads, not the table's shape; adding a column and
-- constraints is allowed — 20260911000000 added orders.shippingMethod and two
-- checks the same way.
--
-- The constraints run through EXEC: SQL Server compiles the whole batch before
-- running any of it, and a constraint naming a column added in the same batch
-- fails to compile otherwise.
--
-- Hand-written for the same reason as 20260908070000. Apply with
-- `prisma migrate deploy`, then `npm run verify:schema`:
--
--   ISJSON checks   20 -> 21

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[orders] ADD
    [billingAddressId] NVARCHAR(64) NULL,
    [billingSnapshot] NVARCHAR(max) NULL;

EXEC('ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_billingAddressId_fkey] FOREIGN KEY ([billingAddressId]) REFERENCES [dbo].[addresses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');

EXEC('ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_billingSnapshot_is_json]
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
