-- The portal bills in New Zealand dollars.
--
-- account_settings.currency defaulted to USD, carried over from the template
-- the schema started from. Every customer is invoiced in NZD, so the default
-- changes and every account still on the old default moves with it. An account
-- that was deliberately set to some other currency is left alone.
--
-- Prices carry no currency of their own (see the model's comment), so nothing
-- is converted: the amounts were always NZD and only the label was wrong.

BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[account_settings] DROP CONSTRAINT [account_settings_currency_df];
ALTER TABLE [dbo].[account_settings] ADD CONSTRAINT [account_settings_currency_df] DEFAULT 'NZD' FOR [currency];

UPDATE [dbo].[account_settings] SET [currency] = 'NZD' WHERE [currency] = 'USD';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
