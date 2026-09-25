-- Alternate ship-to per account (SOW F-18: "alternate ship-to entry enabled or
-- disabled per account by configuration"; AD-8: "alternate ship-to permission").
--
--   account_settings.allowCustomDeliveryAddress   the account switch, off
--   addresses.isOneOff                            typed at checkout, not saved
--                                                 to the branch
--   addresses.createdById                         the buyer who typed it
--
-- A one-off address is an ordinary `addresses` row, so an order can reference
-- and snapshot it exactly as it does a saved one. The flag is what keeps it out
-- of branch address lists; `createdById` is what keeps it to its author.
--
-- Both booleans default to 0: every account keeps today's behaviour — saved
-- addresses only — and every existing address is a saved one. No backfill.
-- `createdById` is a plain column, not a foreign key: the address must outlive
-- a deactivated user, since orders point at it.
--
-- No new table, so row-level security is untouched. `addresses` is covered by
-- the plain account predicate, which reads the session context, not columns.
--
-- Hand-written for the same reason as 20260908070000. Apply with
-- `prisma migrate deploy`; `verify:schema` counts do not move.

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[account_settings] ADD
    [allowCustomDeliveryAddress] BIT NOT NULL CONSTRAINT [account_settings_allowCustomDeliveryAddress_df] DEFAULT 0;

ALTER TABLE [dbo].[addresses] ADD
    [isOneOff] BIT NOT NULL CONSTRAINT [addresses_isOneOff_df] DEFAULT 0,
    [createdById] NVARCHAR(64) NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
