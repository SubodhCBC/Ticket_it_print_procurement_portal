-- Everything the PostgreSQL migrations enforced that Prisma cannot express.
--
-- Value constraints, the closed sets behind the former enums, the JSON columns,
-- the order-number sequence, and the rule that a customer has at most one live
-- contract at a time.
--
-- These are restated in the database rather than left to Zod for the reason the
-- original migration gave: the DTOs are the first line, but the importer, a
-- future admin script and a hand-run UPDATE all reach these tables without
-- passing through a route handler, and a negative price or a 150% discount
-- reaching an invoice is not a bug anyone wants to find from a customer.
--
-- CREATE PROCEDURE and CREATE TRIGGER each have to be the first statement in
-- their batch and Prisma sends a migration as one, so those are wrapped in
-- EXEC. The ALTER TABLEs below need no such thing.

-- ---------------------------------------------------------------------------
-- Order numbers
-- ---------------------------------------------------------------------------
--
-- `ORD-2026-000123`, allocated from a sequence.
--
-- **The sequence is global and does not restart each year.** The year in the
-- reference is when the order was placed, not a counter namespace; restarting
-- would make two orders in different years share a number, and the number is
-- what a customer quotes on the phone.
--
-- **Gaps are accepted.** A sequence does not roll back, so an order write that
-- fails after allocating a number leaves that number unused. Invoice numbers
-- are the ones that must be gapless -- that is a legal requirement on invoices
-- and not on order references, and it is why they are allocated a different way
-- in `invoice_sequences`.
--
-- A stored procedure rather than a function: T-SQL forbids NEXT VALUE FOR
-- inside a function, because a function may not have side effects. Keeping the
-- format here rather than in the application means a hand-run INSERT during an
-- incident produces a reference that looks like every other one.
CREATE SEQUENCE dbo.order_number_seq AS BIGINT START WITH 1 INCREMENT BY 1;

EXEC('
CREATE PROCEDURE dbo.next_order_number
AS
BEGIN
  SET NOCOUNT ON;
  SELECT ''ORD-''
       + FORMAT(SYSUTCDATETIME(), ''yyyy'')
       + ''-''
       + FORMAT(NEXT VALUE FOR dbo.order_number_seq, ''000000'') AS orderNumber;
END
');

-- ---------------------------------------------------------------------------
-- One live contract per customer
-- ---------------------------------------------------------------------------
--
-- PostgreSQL enforced this with an exclusion constraint over a tstzrange:
--
--     EXCLUDE USING gist (accountId WITH =, tstzrange(from, to, '[)') WITH &&)
--       WHERE (status = 'ACTIVE' AND deletedAt IS NULL)
--
-- SQL Server has no exclusion constraints and no range type, so the guarantee
-- moves into a trigger. That is a real downgrade and worth naming: a constraint
-- is enforced by the index and cannot be bypassed, whereas a trigger can be
-- disabled, and does not fire on TRUNCATE or on a bulk insert run with
-- FIRE_TRIGGERS off. It is still enforcement at the database rather than in one
-- service function, which is the property that mattered.
--
-- The window is half-open, `[from, to)`: a card ending on the 1st and one
-- starting on the 1st are not both in force for that instant. A NULL upper
-- bound is unbounded, which is what "open-ended" means -- hence the NULL checks
-- rather than a plain comparison.
--
-- DRAFT and ARCHIVED cards are exempt, as they were: several drafts may be
-- under negotiation at once, and the archive is a history that necessarily
-- overlaps itself.
EXEC('
CREATE TRIGGER dbo.rate_cards_no_overlapping_active
ON dbo.rate_cards
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (
    SELECT 1
    FROM inserted i
    JOIN dbo.rate_cards other
      ON  other.accountId = i.accountId
      AND other.id <> i.id
      AND other.status = ''ACTIVE''
      AND other.deletedAt IS NULL
      AND (other.effectiveTo IS NULL OR other.effectiveTo > i.effectiveFrom)
      AND (i.effectiveTo IS NULL OR i.effectiveTo > other.effectiveFrom)
    WHERE i.status = ''ACTIVE''
      AND i.deletedAt IS NULL
  )
  BEGIN
    THROW 50001,
      ''Another active rate card already covers part of that date window for this account.'',
      1;
  END
END
');

-- ---------------------------------------------------------------------------
-- Value constraints
-- ---------------------------------------------------------------------------

ALTER TABLE dbo.[rate_cards] ADD CONSTRAINT [rate_cards_window_ordered]
  CHECK ([effectiveTo] IS NULL OR [effectiveTo] > [effectiveFrom]);

ALTER TABLE dbo.[rate_cards] ADD CONSTRAINT [rate_cards_default_discount_range]
  CHECK ([defaultDiscountPercent] >= 0 AND [defaultDiscountPercent] <= 100);

-- num_nonnulls() has no T-SQL equivalent, so the count is spelled out. A rate
-- card item prices either by fixed price or by discount, never by both.
ALTER TABLE dbo.[rate_card_items] ADD CONSTRAINT [rate_card_items_one_pricing_rule]
  CHECK (
    (CASE WHEN [fixedPrice] IS NULL THEN 0 ELSE 1 END)
  + (CASE WHEN [discountPercent] IS NULL THEN 0 ELSE 1 END) <= 1
  );

ALTER TABLE dbo.[rate_card_items] ADD CONSTRAINT [rate_card_items_fixed_price_non_negative]
  CHECK ([fixedPrice] IS NULL OR [fixedPrice] >= 0);

ALTER TABLE dbo.[rate_card_items] ADD CONSTRAINT [rate_card_items_discount_range]
  CHECK ([discountPercent] IS NULL OR ([discountPercent] >= 0 AND [discountPercent] <= 100));

ALTER TABLE dbo.[rate_card_tiers] ADD CONSTRAINT [rate_card_tiers_min_quantity_positive]
  CHECK ([minQuantity] >= 1);

ALTER TABLE dbo.[rate_card_tiers] ADD CONSTRAINT [rate_card_tiers_discount_range]
  CHECK ([discountPercent] >= 0 AND [discountPercent] <= 100);

ALTER TABLE dbo.[cart_lines] ADD CONSTRAINT [cart_lines_quantity_positive]
  CHECK ([quantity] >= 1);

-- A personalised line names both a template and the version of it that was
-- accepted, or neither. PostgreSQL could compare two booleans directly;
-- T-SQL has no boolean type, so both halves are stated.
ALTER TABLE dbo.[cart_lines] ADD CONSTRAINT [cart_lines_template_pair]
  CHECK (
    ([templateId] IS NULL AND [templateVersionId] IS NULL)
    OR ([templateId] IS NOT NULL AND [templateVersionId] IS NOT NULL)
  );

ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_totals_non_negative]
  CHECK ([subtotal] >= 0 AND [catalogSubtotal] >= 0 AND [total] >= 0);

-- `YYYY-MM`. PostgreSQL used a regular expression; T-SQL LIKE has character
-- classes but no alternation, so the month range is checked separately rather
-- than encoded as (0[1-9]|1[0-2]).
ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_billing_period_format]
  CHECK (
    [billingPeriod] LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
    AND SUBSTRING([billingPeriod], 6, 2) BETWEEN '01' AND '12'
  );

ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_rejection_has_reason]
  CHECK ([status] <> 'REJECTED' OR [rejectionReason] IS NOT NULL);

ALTER TABLE dbo.[order_line_items] ADD CONSTRAINT [order_line_items_quantity_positive]
  CHECK ([quantity] >= 1);

ALTER TABLE dbo.[order_line_items] ADD CONSTRAINT [order_line_items_prices_non_negative]
  CHECK ([unitPrice] >= 0 AND [lineTotal] >= 0 AND [catalogUnitPrice] >= 0);

ALTER TABLE dbo.[order_line_items] ADD CONSTRAINT [order_line_items_template_pair]
  CHECK (
    ([templateId] IS NULL AND [templateVersionId] IS NULL)
    OR ([templateId] IS NOT NULL AND [templateVersionId] IS NOT NULL)
  );

-- Exactly one approver: a role or a named person, never both and never neither.
ALTER TABLE dbo.[approval_rules] ADD CONSTRAINT [approval_rules_has_an_approver]
  CHECK (
    (CASE WHEN [approverRole] IS NULL THEN 0 ELSE 1 END)
  + (CASE WHEN [approverUserId] IS NULL THEN 0 ELSE 1 END) = 1
  );

ALTER TABLE dbo.[approval_rules] ADD CONSTRAINT [approval_rules_tier_positive]
  CHECK ([tier] >= 1);

ALTER TABLE dbo.[approval_rules] ADD CONSTRAINT [approval_rules_min_total_non_negative]
  CHECK ([minTotal] IS NULL OR [minTotal] >= 0);

ALTER TABLE dbo.[approval_steps] ADD CONSTRAINT [approval_steps_tier_positive]
  CHECK ([tier] >= 1);

-- Refusing an order without saying why leaves the requester with nothing to act
-- on, so the comment is required at the database rather than in the DTO alone.
ALTER TABLE dbo.[approval_steps] ADD CONSTRAINT [approval_steps_refusal_has_comment]
  CHECK ([status] NOT IN ('REJECTED', 'CHANGES_REQUESTED') OR [comment] IS NOT NULL);

-- The invariant the whole reservation scheme rests on: never promise more than
-- is on the shelf.
ALTER TABLE dbo.[products] ADD CONSTRAINT [products_stock_reserved_non_negative]
  CHECK ([stockReserved] >= 0);

ALTER TABLE dbo.[products] ADD CONSTRAINT [products_stock_reserved_within_hand]
  CHECK ([stockReserved] <= [stockOnHand]);

ALTER TABLE dbo.[products] ADD CONSTRAINT [products_reorder_quantity_positive]
  CHECK ([reorderQuantity] IS NULL OR [reorderQuantity] >= 1);

ALTER TABLE dbo.[product_variants] ADD CONSTRAINT [product_variants_stock_reserved_non_negative]
  CHECK ([stockReserved] >= 0);

ALTER TABLE dbo.[product_variants] ADD CONSTRAINT [product_variants_stock_reserved_within_hand]
  CHECK ([stockReserved] <= [stockOnHand]);

ALTER TABLE dbo.[invoices] ADD CONSTRAINT [invoices_billing_period_format]
  CHECK (
    [billingPeriod] LIKE '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
    AND SUBSTRING([billingPeriod], 6, 2) BETWEEN '01' AND '12'
  );

ALTER TABLE dbo.[invoices] ADD CONSTRAINT [invoices_totals_non_negative]
  CHECK ([subtotal] >= 0 AND [tax] >= 0 AND [total] >= 0);

-- A draft has no number and everything else has one. The number is what a
-- customer's accounts department files the document under, so it cannot appear
-- or change after issue.
ALTER TABLE dbo.[invoices] ADD CONSTRAINT [invoices_issued_has_number]
  CHECK (
    ([status] = 'DRAFT' AND [invoiceNumber] IS NULL)
    OR ([status] <> 'DRAFT' AND [invoiceNumber] IS NOT NULL)
  );

ALTER TABLE dbo.[invoices] ADD CONSTRAINT [invoices_void_has_reason]
  CHECK ([status] <> 'VOID' OR [voidReason] IS NOT NULL);

ALTER TABLE dbo.[invoice_lines] ADD CONSTRAINT [invoice_lines_amount_non_negative]
  CHECK ([amount] >= 0);

ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_published_has_version]
  CHECK ([status] <> 'PUBLISHED' OR [publishedVersionId] IS NOT NULL);

ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_dimensions_positive]
  CHECK ([widthValue] > 0 AND [heightValue] > 0);

ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_margins_not_negative]
  CHECK ([bleedMargin] >= 0 AND [safeMargin] >= 0);

ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_version_positive]
  CHECK ([version] >= 1);

ALTER TABLE dbo.[template_versions] ADD CONSTRAINT [template_versions_version_positive]
  CHECK ([version] >= 1);

ALTER TABLE dbo.[template_assets] ADD CONSTRAINT [template_assets_size_positive]
  CHECK ([sizeBytes] > 0);

-- -------------------------------------------------------------------------
-- Enum columns
-- -------------------------------------------------------------------------
--
-- Prisma's SQL Server connector has no enums, so each of these is an NVARCHAR
-- and the closed set lives here. Without them the column would accept any
-- string at all, and a typo in a status would be discovered by the code that
-- later fails to match it rather than by the write that caused it.
--
-- The lists are the same ones the const unions in src/server carry; asEnum()
-- marks every place the two are relied on to agree.

ALTER TABLE dbo.[accounts] ADD CONSTRAINT [accounts_status_enum]
  CHECK ([status] IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'));
ALTER TABLE dbo.[addresses] ADD CONSTRAINT [addresses_kind_enum]
  CHECK ([kind] IN ('BILLING', 'SHIPPING'));
ALTER TABLE dbo.[approval_requests] ADD CONSTRAINT [approval_requests_status_enum]
  CHECK ([status] IN ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED'));
ALTER TABLE dbo.[approval_rules] ADD CONSTRAINT [approval_rules_approverRole_enum]
  CHECK ([approverRole] IS NULL OR [approverRole] IN ('ADMIN', 'HEAD_OFFICE', 'SITE_USER'));
ALTER TABLE dbo.[approval_rules] ADD CONSTRAINT [approval_rules_requesterRole_enum]
  CHECK ([requesterRole] IS NULL OR [requesterRole] IN ('ADMIN', 'HEAD_OFFICE', 'SITE_USER'));
ALTER TABLE dbo.[approval_steps] ADD CONSTRAINT [approval_steps_approverRole_enum]
  CHECK ([approverRole] IS NULL OR [approverRole] IN ('ADMIN', 'HEAD_OFFICE', 'SITE_USER'));
ALTER TABLE dbo.[approval_steps] ADD CONSTRAINT [approval_steps_status_enum]
  CHECK ([status] IN ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SKIPPED'));
ALTER TABLE dbo.[audit_log_entries] ADD CONSTRAINT [audit_log_entries_entityType_enum]
  CHECK ([entityType] IN ('ACCOUNT', 'SITE', 'USER', 'INVITATION', 'PERMISSION', 'PRODUCT', 'RATE_CARD', 'ORDER', 'TEMPLATE', 'INTEGRATION', 'SYSTEM'));
ALTER TABLE dbo.[carts] ADD CONSTRAINT [carts_paymentMethod_enum]
  CHECK ([paymentMethod] IS NULL OR [paymentMethod] IN ('NET_30_INVOICE', 'P_CARD', 'ACH'));
ALTER TABLE dbo.[carts] ADD CONSTRAINT [carts_status_enum]
  CHECK ([status] IN ('OPEN', 'CHECKED_OUT', 'ABANDONED'));
ALTER TABLE dbo.[catalog_import_jobs] ADD CONSTRAINT [catalog_import_jobs_status_enum]
  CHECK ([status] IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'));
ALTER TABLE dbo.[invitations] ADD CONSTRAINT [invitations_role_enum]
  CHECK ([role] IN ('ADMIN', 'HEAD_OFFICE', 'SITE_USER'));
ALTER TABLE dbo.[invitations] ADD CONSTRAINT [invitations_status_enum]
  CHECK ([status] IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'));
ALTER TABLE dbo.[invitations] ADD CONSTRAINT [invitations_userType_enum]
  CHECK ([userType] IN ('EXISTING', 'NEW', 'EXTERNAL'));
ALTER TABLE dbo.[invoices] ADD CONSTRAINT [invoices_status_enum]
  CHECK ([status] IN ('DRAFT', 'ISSUED', 'PAID', 'VOID'));
ALTER TABLE dbo.[order_line_items] ADD CONSTRAINT [order_line_items_uom_enum]
  CHECK ([uom] IN ('EACH', 'PACK', 'BOX', 'ROLL', 'SET', 'SQUARE_METRE'));
ALTER TABLE dbo.[order_status_events] ADD CONSTRAINT [order_status_events_actorRole_enum]
  CHECK ([actorRole] IN ('ADMIN', 'HEAD_OFFICE', 'SITE_USER'));
ALTER TABLE dbo.[order_status_events] ADD CONSTRAINT [order_status_events_fromStatus_enum]
  CHECK ([fromStatus] IS NULL OR [fromStatus] IN ('DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'REJECTED', 'CANCELLED'));
ALTER TABLE dbo.[order_status_events] ADD CONSTRAINT [order_status_events_toStatus_enum]
  CHECK ([toStatus] IN ('DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'REJECTED', 'CANCELLED'));
ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_paymentMethod_enum]
  CHECK ([paymentMethod] IS NULL OR [paymentMethod] IN ('NET_30_INVOICE', 'P_CARD', 'ACH'));
ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_paymentStatus_enum]
  CHECK ([paymentStatus] IN ('UNPAID', 'PAYMENT_PENDING', 'PAID', 'REFUNDED'));
ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_status_enum]
  CHECK ([status] IN ('DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'PROCESSING', 'DISPATCHED', 'DELIVERED', 'REJECTED', 'CANCELLED'));
ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_stockState_enum]
  CHECK ([stockState] IN ('NONE', 'RESERVED', 'CONSUMED', 'RELEASED'));
ALTER TABLE dbo.[product_assets] ADD CONSTRAINT [product_assets_derivativeStatus_enum]
  CHECK ([derivativeStatus] IN ('NOT_APPLICABLE', 'PENDING', 'READY', 'FAILED'));
ALTER TABLE dbo.[product_assets] ADD CONSTRAINT [product_assets_kind_enum]
  CHECK ([kind] IN ('IMAGE', 'ARTWORK', 'SPEC_SHEET'));
ALTER TABLE dbo.[product_categories] ADD CONSTRAINT [product_categories_status_enum]
  CHECK ([status] IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE dbo.[product_variants] ADD CONSTRAINT [product_variants_status_enum]
  CHECK ([status] IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE dbo.[products] ADD CONSTRAINT [products_status_enum]
  CHECK ([status] IN ('DRAFT', 'ACTIVE', 'UNAVAILABLE', 'SUPERSEDED'));
ALTER TABLE dbo.[products] ADD CONSTRAINT [products_uom_enum]
  CHECK ([uom] IN ('EACH', 'PACK', 'BOX', 'ROLL', 'SET', 'SQUARE_METRE'));
ALTER TABLE dbo.[products] ADD CONSTRAINT [products_visibility_enum]
  CHECK ([visibility] IN ('ALL_ACCOUNTS', 'RESTRICTED'));
ALTER TABLE dbo.[rate_cards] ADD CONSTRAINT [rate_cards_status_enum]
  CHECK ([status] IN ('DRAFT', 'ACTIVE', 'ARCHIVED'));
ALTER TABLE dbo.[sites] ADD CONSTRAINT [sites_status_enum]
  CHECK ([status] IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE dbo.[template_assets] ADD CONSTRAINT [template_assets_derivativeStatus_enum]
  CHECK ([derivativeStatus] IN ('NOT_APPLICABLE', 'PENDING', 'READY', 'FAILED'));
ALTER TABLE dbo.[template_assets] ADD CONSTRAINT [template_assets_kind_enum]
  CHECK ([kind] IN ('THUMBNAIL', 'PREVIEW', 'SOURCE'));
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_dimensionUnit_enum]
  CHECK ([dimensionUnit] IN ('IN', 'MM', 'PX'));
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_orientation_enum]
  CHECK ([orientation] IN ('LANDSCAPE', 'PORTRAIT', 'SQUARE'));
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_status_enum]
  CHECK ([status] IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_visibility_enum]
  CHECK ([visibility] IN ('ALL_ACCOUNTS', 'RESTRICTED'));
ALTER TABLE dbo.[user_permission_grants] ADD CONSTRAINT [user_permission_grants_effect_enum]
  CHECK ([effect] IN ('ALLOW', 'DENY'));
ALTER TABLE dbo.[users] ADD CONSTRAINT [users_role_enum]
  CHECK ([role] IN ('ADMIN', 'HEAD_OFFICE', 'SITE_USER'));
ALTER TABLE dbo.[users] ADD CONSTRAINT [users_status_enum]
  CHECK ([status] IN ('ACTIVE', 'PENDING', 'DISABLED'));
ALTER TABLE dbo.[users] ADD CONSTRAINT [users_userType_enum]
  CHECK ([userType] IN ('EXISTING', 'NEW', 'EXTERNAL'));

-- -------------------------------------------------------------------------
-- JSON columns
-- -------------------------------------------------------------------------
--
-- These were jsonb, which could not hold anything that was not JSON. NVARCHAR
-- can, so ISJSON restores the guarantee -- and it is what lets JSON_VALUE and
-- OPENJSON in the reporting queries assume they are reading JSON.

ALTER TABLE dbo.[audit_log_entries] ADD CONSTRAINT [audit_log_entries_details_is_json]
  CHECK ([details] IS NULL OR ISJSON([details]) = 1);
ALTER TABLE dbo.[cart_lines] ADD CONSTRAINT [cart_lines_customisation_is_json]
  CHECK ([customisation] IS NULL OR ISJSON([customisation]) = 1);
ALTER TABLE dbo.[catalog_import_jobs] ADD CONSTRAINT [catalog_import_jobs_payload_is_json]
  CHECK (ISJSON([payload]) = 1);
ALTER TABLE dbo.[catalog_import_jobs] ADD CONSTRAINT [catalog_import_jobs_results_is_json]
  CHECK ([results] IS NULL OR ISJSON([results]) = 1);
ALTER TABLE dbo.[order_line_items] ADD CONSTRAINT [order_line_items_customisation_is_json]
  CHECK ([customisation] IS NULL OR ISJSON([customisation]) = 1);
ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_shippingSnapshot_is_json]
  CHECK (ISJSON([shippingSnapshot]) = 1);
ALTER TABLE dbo.[product_variants] ADD CONSTRAINT [product_variants_attributes_is_json]
  CHECK (ISJSON([attributes]) = 1);
ALTER TABLE dbo.[template_versions] ADD CONSTRAINT [template_versions_snapshot_is_json]
  CHECK (ISJSON([snapshot]) = 1);
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_canvasConfig_is_json]
  CHECK (ISJSON([canvasConfig]) = 1);
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_design_is_json]
  CHECK ([design] IS NULL OR ISJSON([design]) = 1);
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_layers_is_json]
  CHECK (ISJSON([layers]) = 1);