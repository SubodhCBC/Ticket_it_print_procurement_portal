-- The "partially done" gaps, in one change so the schema moves once.
--
-- ---------------------------------------------------------------------------
-- Tax treatment (SOW F-06, B-07; §15 "PDF invoice ... tax summary")
-- ---------------------------------------------------------------------------
--   products.taxTreatment                STANDARD | ZERO_RATED | EXEMPT
--   order_line_items.taxTreatment        the product's, frozen at placement
--   account_settings.pricesIncludeGst    the account's convention (A-08)
--   account_settings.gstRatePercent      15.00, NZ GST
--   invoices.taxRatePercent              the rate the invoice was taxed at
--   invoices.pricesIncludeTax            and on which convention
--
-- Every existing product and order line is STANDARD, which is what an NZ print
-- job is. Every account keeps prices exclusive of GST, the convention the
-- portal has displayed so far, so a regenerated draft adds GST on top. Issued
-- invoices are frozen and are not touched; their tax stays the 0.00 they were
-- issued with, and `taxRatePercent` NULL is how the view tells them apart.
--
-- ---------------------------------------------------------------------------
-- A backing file that reconciles line for line (SOW O-6, B-01..B-11, §15)
-- ---------------------------------------------------------------------------
--   invoice_line_items     one row per order line, plus one per delivery charge
--   invoice_lines.*        the order-level facts the backing file needs that
--                          were not yet copied: who ordered it and in which
--                          role, where it went, the notes, the status and the
--                          tracking number, and the order's tax
--
-- Items are copied, not joined, for the reason invoice_lines are: an issued
-- invoice states what was billed. They carry their own accountId so they join
-- the policy with the plain account predicate instead of a new schema-bound
-- function. `invoiceId` is a plain column: a second cascading path from
-- invoices would be refused by SQL Server, and the one through invoice_lines
-- already removes them.
--
-- ---------------------------------------------------------------------------
-- The ordering user's role (SOW F-13)
-- ---------------------------------------------------------------------------
--   orders.placedByRole    NULL for every existing order. The user's role today
--                          is not the role they held when they ordered.
--
-- ---------------------------------------------------------------------------
-- NZ Post on the saved address (SOW F-16)
-- ---------------------------------------------------------------------------
--   addresses.nzPostAddressId, dpid, isRural, nzPostValidatedAt
--
-- NULL until an address is validated. Nothing is backfilled: a DPID guessed from
-- free text is exactly the disagreement this is here to remove.
--
-- ---------------------------------------------------------------------------
-- Integration health (SOW §15: "call success rate, latency, retry volume,
-- dead-letter count and last reconciliation result")
-- ---------------------------------------------------------------------------
--   integration_calls      one row per carrier call, with its outcome and time
--   reconciliation_runs    one row per reconciliation sweep, with its result
--
-- Platform data, like pickup_bookings: no accountId and no RLS. Neither holds an
-- address, a name or a payload — the operation, the outcome and the timings.
--
-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- New columns on orders, order_line_items, addresses and invoice_lines are
-- allowed under the schema-bound predicates that read those tables, as in
-- 20260916180000. invoice_line_items joins the policy with three lines.
--
-- Hand-written, like every migration since 20260908070000. Apply with
-- `prisma migrate deploy`, then `npm run verify:schema`:
--
--   RLS tables covered       29 -> 30   (filter 29 -> 30, block 58 -> 60)
--   UTC timestamp defaults   43 -> 46
--   enum value checks        51 -> 60
--   ISJSON checks            24 -> 25
--   business-rule checks     45 -> 48

BEGIN TRY

BEGIN TRAN;

-- ---------------------------------------------------------------------------
-- Tax treatment
-- ---------------------------------------------------------------------------
ALTER TABLE [dbo].[products] ADD
    [taxTreatment] VARCHAR(32) NOT NULL CONSTRAINT [products_taxTreatment_df] DEFAULT 'STANDARD';

ALTER TABLE [dbo].[order_line_items] ADD
    [taxTreatment] VARCHAR(32) NOT NULL CONSTRAINT [order_line_items_taxTreatment_df] DEFAULT 'STANDARD';

ALTER TABLE [dbo].[account_settings] ADD
    [pricesIncludeGst] BIT NOT NULL CONSTRAINT [account_settings_pricesIncludeGst_df] DEFAULT 0,
    [gstRatePercent] DECIMAL(5,2) NOT NULL CONSTRAINT [account_settings_gstRatePercent_df] DEFAULT 15.00;

ALTER TABLE [dbo].[invoices] ADD
    [taxRatePercent] DECIMAL(5,2) NULL,
    [pricesIncludeTax] BIT NOT NULL CONSTRAINT [invoices_pricesIncludeTax_df] DEFAULT 0;

EXEC('ALTER TABLE [dbo].[products] ADD CONSTRAINT [products_taxTreatment_enum]
  CHECK ([taxTreatment] IN (''STANDARD'', ''ZERO_RATED'', ''EXEMPT''))');
EXEC('ALTER TABLE [dbo].[order_line_items] ADD CONSTRAINT [order_line_items_taxTreatment_enum]
  CHECK ([taxTreatment] IN (''STANDARD'', ''ZERO_RATED'', ''EXEMPT''))');
EXEC('ALTER TABLE [dbo].[account_settings] ADD CONSTRAINT [account_settings_gstRatePercent_range]
  CHECK ([gstRatePercent] >= 0 AND [gstRatePercent] <= 100)');

-- ---------------------------------------------------------------------------
-- Ordering user's role
-- ---------------------------------------------------------------------------
ALTER TABLE [dbo].[orders] ADD
    [placedByRole] VARCHAR(32) NULL;

EXEC('ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_placedByRole_enum]
  CHECK ([placedByRole] IS NULL OR [placedByRole] IN (''ADMIN'', ''HEAD_OFFICE'', ''SITE_USER''))');

-- ---------------------------------------------------------------------------
-- Invoice lines: the order-level facts the backing file carries
-- ---------------------------------------------------------------------------
ALTER TABLE [dbo].[invoice_lines] ADD
    [placedByName] NVARCHAR(500) NULL,
    [placedByEmail] NVARCHAR(500) NULL,
    [placedByRole] VARCHAR(32) NULL,
    [shippingSnapshot] NVARCHAR(max) NULL,
    [recipientName] NVARCHAR(500) NULL,
    [deliveryNotes] NVARCHAR(500) NULL,
    [orderNotes] NVARCHAR(max) NULL,
    [orderStatus] VARCHAR(32) NULL,
    [trackingNumber] NVARCHAR(500) NULL,
    [tax] DECIMAL(12,2) NOT NULL CONSTRAINT [invoice_lines_tax_df] DEFAULT 0;

EXEC('ALTER TABLE [dbo].[invoice_lines] ADD CONSTRAINT [invoice_lines_shippingSnapshot_is_json]
  CHECK ([shippingSnapshot] IS NULL OR ISJSON([shippingSnapshot]) = 1)');

-- ---------------------------------------------------------------------------
-- invoice_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE [dbo].[invoice_line_items] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [invoiceId] NVARCHAR(64) NOT NULL,
    [invoiceLineId] NVARCHAR(64) NOT NULL,
    [orderLineId] NVARCHAR(64) NULL,
    [kind] VARCHAR(16) NOT NULL,
    [sequence] INT NOT NULL,
    [sku] NVARCHAR(255) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [variantSku] NVARCHAR(500) NULL,
    [uom] VARCHAR(32) NULL,
    [packSize] INT NULL,
    [quantity] INT NOT NULL,
    [unitPrice] DECIMAL(12,2) NOT NULL,
    [lineValue] DECIMAL(12,2) NOT NULL,
    [taxTreatment] VARCHAR(32) NOT NULL,
    [taxAmount] DECIMAL(12,2) NOT NULL,
    [notes] NVARCHAR(max) NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [invoice_line_items_createdAt_df] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [invoice_line_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

EXEC('CREATE NONCLUSTERED INDEX [invoice_line_items_invoiceLineId_sequence_idx] ON [dbo].[invoice_line_items]([invoiceLineId], [sequence])');
EXEC('CREATE NONCLUSTERED INDEX [invoice_line_items_invoiceId_idx] ON [dbo].[invoice_line_items]([invoiceId])');
EXEC('ALTER TABLE [dbo].[invoice_line_items] ADD CONSTRAINT [invoice_line_items_invoiceLineId_fkey] FOREIGN KEY ([invoiceLineId]) REFERENCES [dbo].[invoice_lines]([id]) ON DELETE CASCADE ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[invoice_line_items] ADD CONSTRAINT [invoice_line_items_kind_enum]
  CHECK ([kind] IN (''PRODUCT'', ''DELIVERY''))');
EXEC('ALTER TABLE [dbo].[invoice_line_items] ADD CONSTRAINT [invoice_line_items_taxTreatment_enum]
  CHECK ([taxTreatment] IN (''STANDARD'', ''ZERO_RATED'', ''EXEMPT''))');
EXEC('ALTER TABLE [dbo].[invoice_line_items] ADD CONSTRAINT [invoice_line_items_figures]
  CHECK ([quantity] >= 0 AND [lineValue] >= 0 AND [unitPrice] >= 0 AND [taxAmount] >= 0)');

EXEC('
ALTER SECURITY POLICY dbo.rls_tenant_isolation
  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.invoice_line_items,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.invoice_line_items AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.invoice_line_items AFTER UPDATE
');

-- ---------------------------------------------------------------------------
-- NZ Post on the saved address
-- ---------------------------------------------------------------------------
ALTER TABLE [dbo].[addresses] ADD
    [nzPostAddressId] NVARCHAR(64) NULL,
    [dpid] NVARCHAR(32) NULL,
    [isRural] BIT NULL,
    [nzPostValidatedAt] DATETIMEOFFSET NULL;

-- ---------------------------------------------------------------------------
-- Integration health
-- ---------------------------------------------------------------------------
CREATE TABLE [dbo].[integration_calls] (
    [id] NVARCHAR(64) NOT NULL,
    [provider] VARCHAR(32) NOT NULL,
    [mode] VARCHAR(16) NOT NULL,
    [operation] NVARCHAR(64) NOT NULL,
    [outcome] VARCHAR(16) NOT NULL,
    [durationMs] INT NOT NULL,
    [attempt] INT NOT NULL CONSTRAINT [integration_calls_attempt_df] DEFAULT 1,
    [httpRetries] INT NOT NULL CONSTRAINT [integration_calls_httpRetries_df] DEFAULT 0,
    [errorCode] NVARCHAR(64) NULL,
    [httpStatus] INT NULL,
    [occurredAt] DATETIMEOFFSET NOT NULL CONSTRAINT [integration_calls_occurredAt_df] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [integration_calls_pkey] PRIMARY KEY CLUSTERED ([id])
);

EXEC('CREATE NONCLUSTERED INDEX [integration_calls_provider_occurredAt_idx] ON [dbo].[integration_calls]([provider], [occurredAt])');
EXEC('ALTER TABLE [dbo].[integration_calls] ADD CONSTRAINT [integration_calls_mode_enum]
  CHECK ([mode] IN (''LIVE'', ''MOCK''))');
EXEC('ALTER TABLE [dbo].[integration_calls] ADD CONSTRAINT [integration_calls_outcome_enum]
  CHECK ([outcome] IN (''SUCCEEDED'', ''FAILED''))');
EXEC('ALTER TABLE [dbo].[integration_calls] ADD CONSTRAINT [integration_calls_figures]
  CHECK ([durationMs] >= 0 AND [attempt] >= 1 AND [httpRetries] >= 0)');

CREATE TABLE [dbo].[reconciliation_runs] (
    [id] NVARCHAR(64) NOT NULL,
    [kind] VARCHAR(32) NOT NULL,
    [outcome] VARCHAR(16) NOT NULL,
    [startedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [reconciliation_runs_startedAt_df] DEFAULT SYSUTCDATETIME(),
    [finishedAt] DATETIMEOFFSET NULL,
    [examined] INT NULL,
    [flagged] INT NULL,
    [outstanding] INT NULL,
    [message] NVARCHAR(1000) NULL,
    CONSTRAINT [reconciliation_runs_pkey] PRIMARY KEY CLUSTERED ([id])
);

EXEC('CREATE NONCLUSTERED INDEX [reconciliation_runs_kind_startedAt_idx] ON [dbo].[reconciliation_runs]([kind], [startedAt])');
EXEC('ALTER TABLE [dbo].[reconciliation_runs] ADD CONSTRAINT [reconciliation_runs_kind_enum]
  CHECK ([kind] IN (''UNSCANNED_LABELS''))');
EXEC('ALTER TABLE [dbo].[reconciliation_runs] ADD CONSTRAINT [reconciliation_runs_outcome_enum]
  CHECK ([outcome] IN (''SUCCEEDED'', ''FAILED'', ''SKIPPED''))');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
