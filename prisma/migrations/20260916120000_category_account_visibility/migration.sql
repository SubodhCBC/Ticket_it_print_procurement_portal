-- Category-level account visibility (SOW AD-5: "per-account visibility rules at
-- category and product level, applied server-side at query level").
--
-- ---------------------------------------------------------------------------
-- What changes
-- ---------------------------------------------------------------------------
-- `product_categories.visibility`, defaulting to ALL_ACCOUNTS, so every existing
-- category keeps exactly the audience it has today; and
-- `category_account_visibility`, the allow-list for a RESTRICTED one, shaped
-- like `product_account_visibility`.
--
-- ---------------------------------------------------------------------------
-- Tenant isolation
-- ---------------------------------------------------------------------------
-- The allow-list carries its own accountId and joins the existing policy with the
-- plain account predicate, the same three lines product_account_visibility has.
-- Without them a head-office user could read which other customers share a
-- contract category. `ALTER SECURITY POLICY ... ADD` extends the policy in place:
-- no predicate function is rebuilt and isolation is never switched off.
--
-- `product_categories` itself is not reached by any schema-bound predicate
-- function, so adding a column to it needs none of the drop-and-rebuild that
-- carts or orders would.
--
-- ---------------------------------------------------------------------------
-- Matching the schema guarantees
-- ---------------------------------------------------------------------------
-- `createdAt` defaults to SYSUTCDATETIME(), not CURRENT_TIMESTAMP, and the
-- visibility column gets an `_enum` check like products.visibility has —
-- both are what `verify:schema` holds every other table to.
--
-- ---------------------------------------------------------------------------
-- Why this is hand-written
-- ---------------------------------------------------------------------------
-- The same reason as 20260908070000: `prisma migrate dev` reads the UTC column
-- defaults as drift and offers to undo them. Apply with `prisma migrate deploy`,
-- then run `npm run verify:schema`, whose expected counts move in the same
-- change:
--
--   RLS tables covered           28 -> 29   (filter 28 -> 29, block 56 -> 58)
--   UTC timestamp defaults       42 -> 43
--   enum value checks            50 -> 51
--
-- Statements that name the new column or table run through EXEC, because SQL
-- Server compiles a batch before any of it runs and would otherwise refuse a
-- reference to a column that does not exist yet.

BEGIN TRY

BEGIN TRAN;

-- ---------------------------------------------------------------------------
-- product_categories.visibility
-- ---------------------------------------------------------------------------
ALTER TABLE [dbo].[product_categories] ADD
    [visibility] VARCHAR(32) NOT NULL CONSTRAINT [product_categories_visibility_df] DEFAULT 'ALL_ACCOUNTS';

EXEC('ALTER TABLE [dbo].[product_categories] ADD CONSTRAINT [product_categories_visibility_enum]
  CHECK ([visibility] IN (''ALL_ACCOUNTS'', ''RESTRICTED''))');

-- ---------------------------------------------------------------------------
-- category_account_visibility
-- ---------------------------------------------------------------------------
CREATE TABLE [dbo].[category_account_visibility] (
    [id] NVARCHAR(64) NOT NULL,
    [categoryId] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [category_account_visibility_createdAt_df] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [category_account_visibility_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [category_account_visibility_categoryId_accountId_key] UNIQUE NONCLUSTERED ([categoryId],[accountId])
);

EXEC('CREATE NONCLUSTERED INDEX [category_account_visibility_accountId_idx] ON [dbo].[category_account_visibility]([accountId])');

EXEC('ALTER TABLE [dbo].[category_account_visibility] ADD CONSTRAINT [category_account_visibility_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[product_categories]([id]) ON DELETE CASCADE ON UPDATE NO ACTION');
EXEC('ALTER TABLE [dbo].[category_account_visibility] ADD CONSTRAINT [category_account_visibility_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');

-- ---------------------------------------------------------------------------
-- Row-Level Security: extend the existing policy
-- ---------------------------------------------------------------------------
EXEC('
ALTER SECURITY POLICY dbo.rls_tenant_isolation
  ADD FILTER PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.category_account_visibility,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.category_account_visibility AFTER INSERT,
  ADD BLOCK PREDICATE dbo.rls_fn_account_predicate(accountId) ON dbo.category_account_visibility AFTER UPDATE
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
