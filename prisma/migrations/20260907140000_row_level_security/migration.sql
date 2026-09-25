-- Row-Level Security: the database-level half of tenant isolation.
--
-- The port of the PostgreSQL policies in 20260103000100_row_level_security.
-- withTenantScope() sets `app.current_account_id` on the transaction's
-- connection; these predicates are what make that setting mean something.
--
-- ---------------------------------------------------------------------------
-- What changed in the port, and why
-- ---------------------------------------------------------------------------
-- PostgreSQL exempts the table owner from RLS unless the table is FORCEd, and
-- the portal used that: it connects as the owner and *opts in* to restriction
-- with `SET LOCAL ROLE ticketit_app` for the duration of a tenant scope.
-- Outside a scope -- login, provisioning, migrations, seeds -- it is the owner
-- and the policies do not apply.
--
-- SQL Server has no such exemption. A security policy applies to every user
-- including db_owner, and there is no BYPASSRLS to grant. So the escape moves
-- into the predicate itself: when no session context is set, every row is
-- visible. That reproduces the PostgreSQL behaviour exactly, and it is load
-- bearing for the same reason FORCE was rejected there -- authentication has to
-- find a user *before* it knows which account they belong to:
--
--     SELECT ... FROM users WHERE login = @P1
--
-- runs with no tenant in scope, and a predicate without the NULL escape would
-- return zero rows and every login in the system would fail.
--
-- The consequence to be honest about: the boundary is now "did you set the
-- session context" rather than "did you assume the role". A code path that
-- forgets withTenantScope() runs unrestricted in both designs -- which is why
-- the application-level accountId filter is the first line of defence and this
-- is the second -- but under PostgreSQL that forgetting was at least visible in
-- a grep for SET LOCAL ROLE. Here it is visible in a grep for withTenantScope,
-- which is what every tenant-owned service function already calls.
--
-- ---------------------------------------------------------------------------
-- SESSION_CONTEXT is per connection, not per transaction
-- ---------------------------------------------------------------------------
-- The single most important difference, and the one that can leak data.
-- `SET LOCAL` reverted itself when the transaction ended, so a pooled
-- connection could never carry one request's tenant into the next.
-- sp_set_session_context does not revert -- not on commit, not on rollback --
-- so withTenantScope() has to clear it explicitly. See the note there.
--
-- It is also NOT set with @read_only = 1, deliberately: a read-only key cannot
-- be changed again on that connection, so the first tenant to touch a pooled
-- connection would own it for the life of the process.
--
-- ---------------------------------------------------------------------------
-- Schema binding, and what it means for future migrations
-- ---------------------------------------------------------------------------
-- SQL Server requires predicate functions to be WITH SCHEMABINDING. The seven
-- functions that reach through to a parent table therefore hold a hard
-- dependency on that parent's id and accountId columns, and ALTER TABLE against
-- them will fail while the policy exists.
--
-- Any later migration that changes carts, orders, invoices, rate_cards,
-- rate_card_items or approval_requests must therefore:
--
--     ALTER SECURITY POLICY dbo.rls_tenant_isolation WITH (STATE = OFF);
--     DROP SECURITY POLICY dbo.rls_tenant_isolation;
--     ... the ALTER TABLE ...
--     ... recreate the policy ...
--
-- Keeping every predicate in one policy is what makes that a single statement
-- rather than twenty-three.
--
-- The predicate functions live in dbo with an rls_ prefix rather than in a
-- schema of their own. CREATE SCHEMA has to be the first statement in its
-- batch and Prisma sends a migration as one batch, so a separate schema would
-- need a migration to itself for no gain -- Prisma introspects tables, not
-- functions, so these are invisible to it either way.
--
-- refresh_tokens and password_reset_tokens are deliberately absent, exactly as
-- they were: both are reached only by the unauthenticated auth flow, which has
-- no tenant in scope, and neither carries an accountId to filter on. They are
-- keyed by an unguessable token digest.
--
-- The template tables are absent too. They were absent under PostgreSQL as
-- well -- template_account_visibility has no policy even though its exact
-- counterpart product_account_visibility does. That looks like an oversight in
-- the original rather than a decision, but closing it is a behaviour change and
-- belongs in its own migration, not smuggled into a port.

-- ---------------------------------------------------------------------------
-- 1. The tenant accessor
-- ---------------------------------------------------------------------------
--
-- Every predicate below compares against this. Kept as a function rather than
-- repeating the CAST so there is one place that decides what "the current
-- tenant" means, and one place to change if the key is ever renamed.
EXEC('
CREATE FUNCTION dbo.rls_current_account_id()
  RETURNS NVARCHAR(64)
  WITH SCHEMABINDING
AS
BEGIN
  RETURN CAST(SESSION_CONTEXT(N''app.current_account_id'') AS NVARCHAR(64));
END
');


-- ---------------------------------------------------------------------------
-- 2. Predicates
-- ---------------------------------------------------------------------------
--
-- Inline table-valued functions returning a row when access is allowed, which
-- is the shape SQL Server requires. A scalar function cannot be used and a
-- multi-statement one is not inlined into the query plan.

-- The common case: the row carries the tenant itself.
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


-- Child rows that carry no accountId of their own reach through to the parent
-- that does. One function each rather than a generic one, because SCHEMABINDING
-- ties a function to the tables it names.

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


-- Two levels down: a tier belongs to an item, which belongs to a card.
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
-- 3. The policy
-- ---------------------------------------------------------------------------
--
-- FILTER hides rows on read; BLOCK AFTER INSERT and AFTER UPDATE stop a row
-- being *written* into another tenant, which is the PostgreSQL WITH CHECK half.
-- BEFORE UPDATE and BEFORE DELETE are not stated: the filter predicate has
-- already made those rows invisible, so there is nothing to update or delete.
-- Wrapped in EXEC for the same reason as the functions above, and one more:
-- the whole migration is a single batch, so a bare CREATE SECURITY POLICY is
-- compiled before the EXEC statements have run and cannot see the predicate
-- functions it references. EXEC defers compilation to execution time.
EXEC('
CREATE SECURITY POLICY dbo.rls_tenant_isolation
  -- accounts is matched on its own primary key rather than on an accountId.
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

  -- Children, reaching through to the parent that carries the tenant.
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
