-- NZ Post shipping (SOW §7): the buyer's delivery choice, the labels made for an
-- order, the parcels in them, their tracking events, and courier pickups.
--
-- ---------------------------------------------------------------------------
-- Every table is new
-- ---------------------------------------------------------------------------
-- The obvious home for "which service did the buyer choose" is a column on
-- `carts`, and for "which labels exist" a column or two on `orders`. Both tables
-- are reached by schema-bound RLS predicate functions
-- (`rls_fn_cart_line_predicate`, `rls_fn_order_child_predicate`), so altering
-- either means switching tenant isolation off, dropping the policy and
-- rebuilding all twenty-three tables' worth of predicates -- see the note in
-- 20260907140000. Child tables need none of that, and cost one join.
--
-- The one exception is `orders.carrier` / `orders.trackingNumber`, which already
-- exist; the application writes them at dispatch. Writing a value is not
-- altering the table.
--
-- ---------------------------------------------------------------------------
-- Tenant isolation
-- ---------------------------------------------------------------------------
-- The five tenant-owned tables each carry their own accountId, children
-- included, and are added to the existing policy with the plain account
-- predicate. The alternative for the children -- a new function reaching
-- through to `shipments` -- would be schema-bound to `shipments`, and every later
-- change to that table would inherit the drop-and-rebuild above. Denormalising
-- one column is the cheaper side of that trade.
--
-- `ALTER SECURITY POLICY ... ADD` extends the policy in place; nothing already
-- covered is touched, and isolation is never switched off.
--
-- `pickup_bookings` is deliberately not covered: one pickup collects parcels
-- for many customers, so the row belongs to the operator, not to a tenant, and
-- only ORDER_MANAGE reaches it.
--
-- ---------------------------------------------------------------------------
-- Why this is hand-written
-- ---------------------------------------------------------------------------
-- The same reason as 20260908070000: `prisma migrate dev` reads the UTC column
-- defaults and the filtered unique indexes as drift and offers to undo them.
-- Apply with `prisma migrate deploy`, then run `npm run verify:schema`, whose
-- expected counts move in the same change:
--
--   RLS tables covered           23 -> 28   (filter 23 -> 28, block 46 -> 56)
--   filtered unique indexes      10 -> 11   (shipments.consignmentId)
--   UTC timestamp defaults       36 -> 42
--   enum value checks            42 -> 48
--   ISJSON checks                11 -> 18
--   business-rule checks         39 -> 44

BEGIN TRY

BEGIN TRAN;

-- ---------------------------------------------------------------------------
-- cart_shipping_selections
-- ---------------------------------------------------------------------------
CREATE TABLE [dbo].[cart_shipping_selections] (
    [cartId] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [deliveryKind] VARCHAR(32) NOT NULL CONSTRAINT [cart_shipping_selections_deliveryKind_df] DEFAULT 'ADDRESS',
    [nzPostAddressId] NVARCHAR(64),
    [dpid] NVARCHAR(32),
    [isRural] BIT,
    [fullAddress] NVARCHAR(500),
    [deliveryAddress] NVARCHAR(max),
    [collectionPointId] NVARCHAR(64),
    [collectionPoint] NVARCHAR(max),
    [serviceCode] NVARCHAR(32),
    [serviceDescription] NVARCHAR(255),
    [quoteSource] VARCHAR(32),
    [quotedPriceExclGst] DECIMAL(12,2),
    [quotedPriceInclGst] DECIMAL(12,2),
    [quotedAt] DATETIMEOFFSET,
    [parcelEstimate] NVARCHAR(max),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [cart_shipping_selections_createdAt_df] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [cart_shipping_selections_pkey] PRIMARY KEY CLUSTERED ([cartId]),
    CONSTRAINT [cart_shipping_selections_deliveryKind_enum]
      CHECK ([deliveryKind] IN ('ADDRESS', 'COLLECTION')),
    CONSTRAINT [cart_shipping_selections_quoteSource_enum]
      CHECK ([quoteSource] IS NULL OR [quoteSource] IN ('NZPOST', 'FLAT_RATE')),
    CONSTRAINT [cart_shipping_selections_deliveryAddress_is_json]
      CHECK ([deliveryAddress] IS NULL OR ISJSON([deliveryAddress]) = 1),
    CONSTRAINT [cart_shipping_selections_collectionPoint_is_json]
      CHECK ([collectionPoint] IS NULL OR ISJSON([collectionPoint]) = 1),
    CONSTRAINT [cart_shipping_selections_parcelEstimate_is_json]
      CHECK ([parcelEstimate] IS NULL OR ISJSON([parcelEstimate]) = 1),
    -- Freight is never negative. Zero is a real answer: a flat rate of nothing.
    CONSTRAINT [cart_shipping_selections_quote_non_negative]
      CHECK (([quotedPriceExclGst] IS NULL OR [quotedPriceExclGst] >= 0)
         AND ([quotedPriceInclGst] IS NULL OR [quotedPriceInclGst] >= 0))
);

-- ---------------------------------------------------------------------------
-- order_shipping
-- ---------------------------------------------------------------------------
CREATE TABLE [dbo].[order_shipping] (
    [orderId] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [deliveryKind] VARCHAR(32) NOT NULL CONSTRAINT [order_shipping_deliveryKind_df] DEFAULT 'ADDRESS',
    [nzPostAddressId] NVARCHAR(64),
    [dpid] NVARCHAR(32),
    [isRural] BIT,
    [fullAddress] NVARCHAR(500),
    [deliveryAddress] NVARCHAR(max),
    [collectionPointId] NVARCHAR(64),
    [collectionPoint] NVARCHAR(max),
    [serviceCode] NVARCHAR(32),
    [serviceDescription] NVARCHAR(255),
    [quoteSource] VARCHAR(32),
    [quotedPriceExclGst] DECIMAL(12,2),
    [quotedPriceInclGst] DECIMAL(12,2),
    [quotedAt] DATETIMEOFFSET,
    [parcelEstimate] NVARCHAR(max),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [order_shipping_createdAt_df] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [order_shipping_pkey] PRIMARY KEY CLUSTERED ([orderId]),
    CONSTRAINT [order_shipping_deliveryKind_enum]
      CHECK ([deliveryKind] IN ('ADDRESS', 'COLLECTION')),
    CONSTRAINT [order_shipping_quoteSource_enum]
      CHECK ([quoteSource] IS NULL OR [quoteSource] IN ('NZPOST', 'FLAT_RATE')),
    CONSTRAINT [order_shipping_deliveryAddress_is_json]
      CHECK ([deliveryAddress] IS NULL OR ISJSON([deliveryAddress]) = 1),
    CONSTRAINT [order_shipping_collectionPoint_is_json]
      CHECK ([collectionPoint] IS NULL OR ISJSON([collectionPoint]) = 1),
    CONSTRAINT [order_shipping_parcelEstimate_is_json]
      CHECK ([parcelEstimate] IS NULL OR ISJSON([parcelEstimate]) = 1),
    CONSTRAINT [order_shipping_quote_non_negative]
      CHECK (([quotedPriceExclGst] IS NULL OR [quotedPriceExclGst] >= 0)
         AND ([quotedPriceInclGst] IS NULL OR [quotedPriceInclGst] >= 0))
);

-- ---------------------------------------------------------------------------
-- pickup_bookings (created before shipments, which reference it)
-- ---------------------------------------------------------------------------
CREATE TABLE [dbo].[pickup_bookings] (
    [id] NVARCHAR(64) NOT NULL,
    [status] VARCHAR(32) NOT NULL,
    [idempotencyKey] NVARCHAR(128) NOT NULL,
    [pickupAt] DATETIMEOFFSET NOT NULL,
    [parcelQuantity] INT NOT NULL,
    [estimatedWeightGrams] INT NOT NULL,
    [instructions] NVARCHAR(500),
    [carrierJobId] NVARCHAR(64),
    [carrierJobNumber] NVARCHAR(64),
    [responseType] NVARCHAR(32),
    [rejectCode] NVARCHAR(32),
    [messageId] NVARCHAR(64),
    [lastError] NVARCHAR(2000),
    [requestedById] NVARCHAR(64),
    [requestedByName] NVARCHAR(500) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [pickup_bookings_createdAt_df] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [pickup_bookings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [pickup_bookings_idempotencyKey_key] UNIQUE NONCLUSTERED ([idempotencyKey]),
    CONSTRAINT [pickup_bookings_status_enum]
      CHECK ([status] IN ('BOOKED', 'REJECTED', 'FAILED'))
);

-- ---------------------------------------------------------------------------
-- shipments
-- ---------------------------------------------------------------------------
CREATE TABLE [dbo].[shipments] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [orderId] NVARCHAR(64) NOT NULL,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [shipments_status_df] DEFAULT 'PENDING',
    [carrier] NVARCHAR(64) NOT NULL CONSTRAINT [shipments_carrier_df] DEFAULT 'COURIERPOST',
    [serviceCode] NVARCHAR(32) NOT NULL,
    [idempotencyKey] NVARCHAR(128) NOT NULL,
    [requestPayload] NVARCHAR(max) NOT NULL,
    [consignmentId] NVARCHAR(64),
    [messageId] NVARCHAR(64),
    [labelFileKey] NVARCHAR(500),
    [labelExpiresAt] DATETIMEOFFSET,
    [attempts] INT NOT NULL CONSTRAINT [shipments_attempts_df] DEFAULT 0,
    [lastError] NVARCHAR(2000),
    [requestedById] NVARCHAR(64),
    [requestedByName] NVARCHAR(500) NOT NULL,
    [pickupBookingId] NVARCHAR(64),
    [labelledAt] DATETIMEOFFSET,
    [lastTrackedAt] DATETIMEOFFSET,
    [deliveredAt] DATETIMEOFFSET,
    [unscannedFlaggedAt] DATETIMEOFFSET,
    [voidedAt] DATETIMEOFFSET,
    [voidReason] NVARCHAR(500),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [shipments_createdAt_df] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [shipments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [shipments_idempotencyKey_key] UNIQUE NONCLUSTERED ([idempotencyKey]),
    CONSTRAINT [shipments_status_enum]
      CHECK ([status] IN ('PENDING', 'SUBMITTED', 'LABELLED', 'FAILED', 'VOIDED')),
    CONSTRAINT [shipments_requestPayload_is_json]
      CHECK (ISJSON([requestPayload]) = 1),
    -- A voided shipment says when. The unscanned-label check and the dispatch
    -- rule both read `voidedAt`, and a VOIDED row without one would be counted
    -- as live by one of them.
    CONSTRAINT [shipments_voided_has_timestamp]
      CHECK ([status] <> 'VOIDED' OR [voidedAt] IS NOT NULL),
    -- LABELLED is the state dispatch trusts: there is a consignment, and there is
    -- a PDF to print. Neither half on its own is a label.
    CONSTRAINT [shipments_labelled_has_consignment]
      CHECK ([status] <> 'LABELLED' OR ([consignmentId] IS NOT NULL AND [labelFileKey] IS NOT NULL))
);

-- ---------------------------------------------------------------------------
-- shipment_parcels
-- ---------------------------------------------------------------------------
CREATE TABLE [dbo].[shipment_parcels] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [shipmentId] NVARCHAR(64) NOT NULL,
    [sequence] INT NOT NULL,
    [serviceCode] NVARCHAR(32) NOT NULL,
    [description] NVARCHAR(255),
    [weightGrams] INT NOT NULL,
    [lengthMm] INT NOT NULL,
    [widthMm] INT NOT NULL,
    [heightMm] INT NOT NULL,
    [labelId] NVARCHAR(64),
    [trackingReference] NVARCHAR(64),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [shipment_parcels_createdAt_df] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [shipment_parcels_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [shipment_parcels_shipmentId_sequence_key] UNIQUE NONCLUSTERED ([shipmentId], [sequence]),
    -- A box with no weight or no size is not something NZ Post will rate, and a
    -- zero here is a form field somebody skipped rather than a measurement.
    CONSTRAINT [shipment_parcels_positive_measurements]
      CHECK ([weightGrams] > 0 AND [lengthMm] > 0 AND [widthMm] > 0 AND [heightMm] > 0)
);

-- ---------------------------------------------------------------------------
-- shipment_tracking_events
-- ---------------------------------------------------------------------------
CREATE TABLE [dbo].[shipment_tracking_events] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [shipmentId] NVARCHAR(64) NOT NULL,
    [trackingReference] NVARCHAR(64) NOT NULL,
    [dedupeKey] NVARCHAR(255) NOT NULL,
    [occurredAt] DATETIMEOFFSET NOT NULL,
    [status] NVARCHAR(255),
    [description] NVARCHAR(1000),
    [edifactCode] NVARCHAR(32),
    [depotName] NVARCHAR(255),
    [signedByName] NVARCHAR(255),
    [isDelivered] BIT NOT NULL CONSTRAINT [shipment_tracking_events_isDelivered_df] DEFAULT 0,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [shipment_tracking_events_createdAt_df] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [shipment_tracking_events_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [shipment_tracking_events_shipmentId_dedupeKey_key] UNIQUE NONCLUSTERED ([shipmentId], [dedupeKey])
);

-- ---------------------------------------------------------------------------
-- Indexes and foreign keys
-- ---------------------------------------------------------------------------
-- Through EXEC, like everything after a CREATE in the hand-written migrations:
-- SQL Server compiles the whole batch before running any of it.

EXEC('CREATE NONCLUSTERED INDEX [cart_shipping_selections_accountId_idx] ON [dbo].[cart_shipping_selections]([accountId])');
EXEC('CREATE NONCLUSTERED INDEX [order_shipping_accountId_idx] ON [dbo].[order_shipping]([accountId])');
EXEC('CREATE NONCLUSTERED INDEX [pickup_bookings_pickupAt_idx] ON [dbo].[pickup_bookings]([pickupAt])');
EXEC('CREATE NONCLUSTERED INDEX [shipments_orderId_idx] ON [dbo].[shipments]([orderId])');
EXEC('CREATE NONCLUSTERED INDEX [shipments_accountId_status_idx] ON [dbo].[shipments]([accountId], [status])');
EXEC('CREATE NONCLUSTERED INDEX [shipments_status_lastTrackedAt_idx] ON [dbo].[shipments]([status], [lastTrackedAt])');
EXEC('CREATE NONCLUSTERED INDEX [shipments_pickupBookingId_idx] ON [dbo].[shipments]([pickupBookingId])');
EXEC('CREATE NONCLUSTERED INDEX [shipment_parcels_trackingReference_idx] ON [dbo].[shipment_parcels]([trackingReference])');
EXEC('CREATE NONCLUSTERED INDEX [shipment_tracking_events_shipmentId_occurredAt_idx] ON [dbo].[shipment_tracking_events]([shipmentId], [occurredAt])');

-- A consignment id is unique where there is one. A PENDING shipment has none
-- yet, and on SQL Server a plain unique index would allow exactly one of those
-- in the whole system -- see 20260907160000.
EXEC('CREATE UNIQUE NONCLUSTERED INDEX [shipments_consignmentId_key] ON [dbo].[shipments]([consignmentId]) WHERE [consignmentId] IS NOT NULL');

EXEC('ALTER TABLE [dbo].[cart_shipping_selections] ADD CONSTRAINT [cart_shipping_selections_cartId_fkey] FOREIGN KEY ([cartId]) REFERENCES [dbo].[carts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[cart_shipping_selections] ADD CONSTRAINT [cart_shipping_selections_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[order_shipping] ADD CONSTRAINT [order_shipping_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[order_shipping] ADD CONSTRAINT [order_shipping_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[shipments] ADD CONSTRAINT [shipments_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[shipments] ADD CONSTRAINT [shipments_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[shipments] ADD CONSTRAINT [shipments_pickupBookingId_fkey] FOREIGN KEY ([pickupBookingId]) REFERENCES [dbo].[pickup_bookings]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[shipment_parcels] ADD CONSTRAINT [shipment_parcels_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[shipment_parcels] ADD CONSTRAINT [shipment_parcels_shipmentId_fkey] FOREIGN KEY ([shipmentId]) REFERENCES [dbo].[shipments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[shipment_tracking_events] ADD CONSTRAINT [shipment_tracking_events_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[shipment_tracking_events] ADD CONSTRAINT [shipment_tracking_events_shipmentId_fkey] FOREIGN KEY ([shipmentId]) REFERENCES [dbo].[shipments]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');

-- ---------------------------------------------------------------------------
-- Row-Level Security: extend the existing policy
-- ---------------------------------------------------------------------------
EXEC('
ALTER SECURITY POLICY dbo.rls_tenant_isolation
  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.cart_shipping_selections,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.cart_shipping_selections AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.cart_shipping_selections AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.order_shipping,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.order_shipping AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.order_shipping AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipments,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipments AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipments AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipment_parcels,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipment_parcels AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipment_parcels AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipment_tracking_events,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipment_tracking_events AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipment_tracking_events AFTER UPDATE
');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
