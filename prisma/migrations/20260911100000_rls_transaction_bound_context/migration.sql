-- Row-Level Security: honour the tenant only inside the transaction that set it.
--
-- ---------------------------------------------------------------------------
-- The fault
-- ---------------------------------------------------------------------------
-- withTenantScope() sets `app.current_account_id` with sp_set_session_context
-- and clears it in a `finally`. SESSION_CONTEXT belongs to the connection, not
-- the transaction, so the clear is what stops a pooled connection carrying one
-- request's tenant into the next.
--
-- On 2026-09-11 order placement ran past Prisma's transaction timeout. Prisma
-- then refuses every further statement on that transaction -- the clear
-- included -- and the connection went back to the pool with the tenant still
-- set. The next request to take that connection would have run its *unscoped*
-- queries (login, provisioning, an administrator's cross-tenant list) filtered
-- to someone else's account: quietly returning too little, not failing.
--
-- ---------------------------------------------------------------------------
-- The fix
-- ---------------------------------------------------------------------------
-- withTenantScope() now also stores CURRENT_TRANSACTION_ID() under
-- `app.current_tx`, in the same batch as the tenant. The accessor every
-- predicate reads returns the tenant only while the current transaction is
-- still that one. A value left behind by a transaction that has ended --
-- committed, rolled back or timed out -- no longer matches anything, so a later
-- statement on the same connection sees no tenant, which is exactly the
-- unscoped behaviour it should have had.
--
-- Checked on this server before writing: every statement inside one Prisma
-- interactive transaction reports the same CURRENT_TRANSACTION_ID(), and an
-- autocommit statement reports a different one.
--
-- ---------------------------------------------------------------------------
-- Why the whole policy is rebuilt
-- ---------------------------------------------------------------------------
-- The accessor is referenced by the predicate functions WITH SCHEMABINDING, and
-- those are bound into the security policy, so none of them can be altered in
-- place -- the procedure 20260907140000 describes. Everything below happens in
-- one transaction: there is no moment, visible to any other session, at which
-- the tables are unprotected.
--
-- The predicates themselves are unchanged, function for function and table for
-- table: the 23 tables from 20260907140000 and the 5 shipping tables from
-- 20260911090000. `npm run verify:schema` counts stay at 28 tables, 28 filter
-- and 56 block predicates, and 8 functions. `npm run verify:isolation` gains a
-- check that a tenant left behind by an ended transaction is ignored.
--
-- Hand-written for the reason every migration since 20260908070000 is: apply
-- with `prisma migrate deploy`, never `migrate dev`.

BEGIN TRY

BEGIN TRAN;

-- ---------------------------------------------------------------------------
-- 1. Take the policy and its functions down
-- ---------------------------------------------------------------------------
EXEC('ALTER SECURITY POLICY dbo.rls_tenant_isolation WITH (STATE = OFF)');
EXEC('DROP SECURITY POLICY dbo.rls_tenant_isolation');

EXEC('DROP FUNCTION dbo.rls_fn_account_predicate');
EXEC('DROP FUNCTION dbo.rls_fn_cart_line_predicate');
EXEC('DROP FUNCTION dbo.rls_fn_order_child_predicate');
EXEC('DROP FUNCTION dbo.rls_fn_invoice_line_predicate');
EXEC('DROP FUNCTION dbo.rls_fn_rate_card_item_predicate');
EXEC('DROP FUNCTION dbo.rls_fn_rate_card_tier_predicate');
EXEC('DROP FUNCTION dbo.rls_fn_approval_step_predicate');
EXEC('DROP FUNCTION dbo.rls_current_account_id');

-- ---------------------------------------------------------------------------
-- 2. The accessor, now bound to the transaction
-- ---------------------------------------------------------------------------
-- NULL -- "no tenant in scope, every row visible" -- unless the tenant was set
-- in the transaction this statement is running in. A tenant with no stored
-- transaction id at all, as a connection set up by an older build would carry,
-- is ignored the same way.
EXEC('
CREATE FUNCTION dbo.rls_current_account_id()
  RETURNS NVARCHAR(64)
  WITH SCHEMABINDING
AS
BEGIN
  IF CAST(SESSION_CONTEXT(N''app.current_tx'') AS BIGINT) = CURRENT_TRANSACTION_ID()
    RETURN CAST(SESSION_CONTEXT(N''app.current_account_id'') AS NVARCHAR(64));
  RETURN NULL;
END
');

-- ---------------------------------------------------------------------------
-- 3. The predicates, exactly as 20260907140000 defined them
-- ---------------------------------------------------------------------------
EXEC('
CREATE FUNCTION dbo.rls_fn_account_predicate(@accountId NVARCHAR(64))
  RETURNS TABLE
  WITH SCHEMABINDING
AS
  RETURN
    SELECT 1 AS allowed
    WHERE dbo.rls_current_account_id() IS NULL
       OR @accountId = dbo.rls_current_account_id()
');

EXEC('
CREATE FUNCTION dbo.rls_fn_cart_line_predicate(@cartId NVARCHAR(64))
  RETURNS TABLE
  WITH SCHEMABINDING
AS
  RETURN
    SELECT 1 AS allowed
    WHERE dbo.rls_current_account_id() IS NULL
       OR EXISTS (
            SELECT 1 FROM dbo.carts c
            WHERE c.id = @cartId
              AND c.accountId = dbo.rls_current_account_id()
          )
');

EXEC('
CREATE FUNCTION dbo.rls_fn_order_child_predicate(@orderId NVARCHAR(64))
  RETURNS TABLE
  WITH SCHEMABINDING
AS
  RETURN
    SELECT 1 AS allowed
    WHERE dbo.rls_current_account_id() IS NULL
       OR EXISTS (
            SELECT 1 FROM dbo.orders o
            WHERE o.id = @orderId
              AND o.accountId = dbo.rls_current_account_id()
          )
');

EXEC('
CREATE FUNCTION dbo.rls_fn_invoice_line_predicate(@invoiceId NVARCHAR(64))
  RETURNS TABLE
  WITH SCHEMABINDING
AS
  RETURN
    SELECT 1 AS allowed
    WHERE dbo.rls_current_account_id() IS NULL
       OR EXISTS (
            SELECT 1 FROM dbo.invoices i
            WHERE i.id = @invoiceId
              AND i.accountId = dbo.rls_current_account_id()
          )
');

EXEC('
CREATE FUNCTION dbo.rls_fn_rate_card_item_predicate(@rateCardId NVARCHAR(64))
  RETURNS TABLE
  WITH SCHEMABINDING
AS
  RETURN
    SELECT 1 AS allowed
    WHERE dbo.rls_current_account_id() IS NULL
       OR EXISTS (
            SELECT 1 FROM dbo.rate_cards c
            WHERE c.id = @rateCardId
              AND c.accountId = dbo.rls_current_account_id()
          )
');

EXEC('
CREATE FUNCTION dbo.rls_fn_rate_card_tier_predicate(@rateCardItemId NVARCHAR(64))
  RETURNS TABLE
  WITH SCHEMABINDING
AS
  RETURN
    SELECT 1 AS allowed
    WHERE dbo.rls_current_account_id() IS NULL
       OR EXISTS (
            SELECT 1
            FROM dbo.rate_card_items i
            JOIN dbo.rate_cards c ON c.id = i.rateCardId
            WHERE i.id = @rateCardItemId
              AND c.accountId = dbo.rls_current_account_id()
          )
');

EXEC('
CREATE FUNCTION dbo.rls_fn_approval_step_predicate(@requestId NVARCHAR(64))
  RETURNS TABLE
  WITH SCHEMABINDING
AS
  RETURN
    SELECT 1 AS allowed
    WHERE dbo.rls_current_account_id() IS NULL
       OR EXISTS (
            SELECT 1 FROM dbo.approval_requests r
            WHERE r.id = @requestId
              AND r.accountId = dbo.rls_current_account_id()
          )
');

-- ---------------------------------------------------------------------------
-- 4. The policy, every table it covered before
-- ---------------------------------------------------------------------------
EXEC('
CREATE SECURITY POLICY dbo.rls_tenant_isolation
  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(id) ON dbo.accounts,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(id) ON dbo.accounts AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(id) ON dbo.accounts AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.users,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.users AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.users AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.sites,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.sites AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.sites AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.addresses,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.addresses AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.addresses AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.user_site_access,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.user_site_access AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.user_site_access AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.user_permission_grants,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.user_permission_grants AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.user_permission_grants AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.invitations,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.invitations AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.invitations AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.audit_log_entries,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.audit_log_entries AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.audit_log_entries AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.product_account_visibility,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.product_account_visibility AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.product_account_visibility AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.catalog_import_jobs,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.catalog_import_jobs AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.catalog_import_jobs AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.rate_cards,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.rate_cards AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.rate_cards AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.carts,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.carts AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.carts AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.orders,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.orders AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.orders AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.approval_rules,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.approval_rules AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.approval_rules AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.approval_requests,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.approval_requests AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.approval_requests AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.invoices,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.invoices AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.invoices AFTER UPDATE,

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
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.shipment_tracking_events AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_cart_line_predicate(cartId) ON dbo.cart_lines,
  ADD BLOCK PREDICATE dbo.rls_fn_cart_line_predicate(cartId) ON dbo.cart_lines AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_cart_line_predicate(cartId) ON dbo.cart_lines AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_order_child_predicate(orderId) ON dbo.order_line_items,
  ADD BLOCK PREDICATE dbo.rls_fn_order_child_predicate(orderId) ON dbo.order_line_items AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_order_child_predicate(orderId) ON dbo.order_line_items AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_order_child_predicate(orderId) ON dbo.order_status_events,
  ADD BLOCK PREDICATE dbo.rls_fn_order_child_predicate(orderId) ON dbo.order_status_events AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_order_child_predicate(orderId) ON dbo.order_status_events AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_invoice_line_predicate(invoiceId) ON dbo.invoice_lines,
  ADD BLOCK PREDICATE dbo.rls_fn_invoice_line_predicate(invoiceId) ON dbo.invoice_lines AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_invoice_line_predicate(invoiceId) ON dbo.invoice_lines AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_rate_card_item_predicate(rateCardId) ON dbo.rate_card_items,
  ADD BLOCK PREDICATE dbo.rls_fn_rate_card_item_predicate(rateCardId) ON dbo.rate_card_items AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_rate_card_item_predicate(rateCardId) ON dbo.rate_card_items AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_rate_card_tier_predicate(rateCardItemId) ON dbo.rate_card_tiers,
  ADD BLOCK PREDICATE dbo.rls_fn_rate_card_tier_predicate(rateCardItemId) ON dbo.rate_card_tiers AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_rate_card_tier_predicate(rateCardItemId) ON dbo.rate_card_tiers AFTER UPDATE,

  ADD FILTER PREDICATE dbo.rls_fn_approval_step_predicate(requestId) ON dbo.approval_steps,
  ADD BLOCK PREDICATE dbo.rls_fn_approval_step_predicate(requestId) ON dbo.approval_steps AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_approval_step_predicate(requestId) ON dbo.approval_steps AFTER UPDATE

  WITH (STATE = ON)
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
