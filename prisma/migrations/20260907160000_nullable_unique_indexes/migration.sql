-- Unique indexes over nullable columns.
--
-- ---------------------------------------------------------------------------
-- The difference this migration exists for
-- ---------------------------------------------------------------------------
-- PostgreSQL treats NULLs as distinct in a unique index, so any number of rows
-- may hold NULL in a unique column. SQL Server treats them as equal, so exactly
-- one may.
--
-- Prisma emits the same `CREATE UNIQUE INDEX` for both, which means every one of
-- these ten constraints silently changes meaning on SQL Server. Not subtly,
-- either -- the schema as generated allows:
--
--   * one user with no legacy counterpart, and no more. Every portal-native and
--     external user has a NULL legacyUserId, so the second one to be created
--     fails.
--   * one draft invoice, ever. A draft has no number by construction -- the
--     invoices_issued_has_number constraint requires exactly that -- so the
--     second draft in the system collides with the first.
--   * one outstanding invitation, one order placed outside a cart, one site
--     with no legacy outlet, one template without a thumbnail.
--
-- The seed found it on its second site. It would otherwise have been found in
-- production by the second customer.
--
-- The fix is a filtered index, which is what a partial unique index is called
-- here: uniqueness applies to the rows that have a value, and rows without one
-- are simply not indexed. That is exactly the PostgreSQL behaviour.
--
-- ---------------------------------------------------------------------------
-- Prisma will want to recreate these
-- ---------------------------------------------------------------------------
-- `@unique` in schema.prisma still describes a plain unique index, so
-- `migrate dev` will see the filter as drift and offer to undo it. The filtered
-- index has to be reapplied after any such regeneration -- there is no schema
-- syntax for it. Marked here because a future migration that silently drops
-- these takes the bugs above with it.

-- Prisma emits these as UNIQUE KEY constraints rather than standalone indexes,
-- and SQL Server refuses DROP INDEX on the index that enforces a constraint --
-- hence ALTER TABLE ... DROP CONSTRAINT, followed by a plain filtered index
-- which is the only form that can carry a WHERE clause.

-- ---------------------------------------------------------------------------
-- Single nullable columns
-- ---------------------------------------------------------------------------

ALTER TABLE dbo.[sites] DROP CONSTRAINT [sites_legacyOutletId_key];
CREATE UNIQUE INDEX [sites_legacyOutletId_key]
  ON dbo.[sites] ([legacyOutletId])
  WHERE [legacyOutletId] IS NOT NULL;

ALTER TABLE dbo.[users] DROP CONSTRAINT [users_legacyUserId_key];
CREATE UNIQUE INDEX [users_legacyUserId_key]
  ON dbo.[users] ([legacyUserId])
  WHERE [legacyUserId] IS NOT NULL;

ALTER TABLE dbo.[invitations] DROP CONSTRAINT [invitations_acceptedUserId_key];
CREATE UNIQUE INDEX [invitations_acceptedUserId_key]
  ON dbo.[invitations] ([acceptedUserId])
  WHERE [acceptedUserId] IS NOT NULL;

ALTER TABLE dbo.[refresh_tokens] DROP CONSTRAINT [refresh_tokens_rotatedToId_key];
CREATE UNIQUE INDEX [refresh_tokens_rotatedToId_key]
  ON dbo.[refresh_tokens] ([rotatedToId])
  WHERE [rotatedToId] IS NOT NULL;

ALTER TABLE dbo.[orders] DROP CONSTRAINT [orders_cartId_key];
CREATE UNIQUE INDEX [orders_cartId_key]
  ON dbo.[orders] ([cartId])
  WHERE [cartId] IS NOT NULL;

ALTER TABLE dbo.[invoices] DROP CONSTRAINT [invoices_invoiceNumber_key];
CREATE UNIQUE INDEX [invoices_invoiceNumber_key]
  ON dbo.[invoices] ([invoiceNumber])
  WHERE [invoiceNumber] IS NOT NULL;

ALTER TABLE dbo.[templates] DROP CONSTRAINT [templates_thumbnailAssetId_key];
CREATE UNIQUE INDEX [templates_thumbnailAssetId_key]
  ON dbo.[templates] ([thumbnailAssetId])
  WHERE [thumbnailAssetId] IS NOT NULL;

ALTER TABLE dbo.[templates] DROP CONSTRAINT [templates_previewAssetId_key];
CREATE UNIQUE INDEX [templates_previewAssetId_key]
  ON dbo.[templates] ([previewAssetId])
  WHERE [previewAssetId] IS NOT NULL;

ALTER TABLE dbo.[templates] DROP CONSTRAINT [templates_publishedVersionId_key];
CREATE UNIQUE INDEX [templates_publishedVersionId_key]
  ON dbo.[templates] ([publishedVersionId])
  WHERE [publishedVersionId] IS NOT NULL;

-- ---------------------------------------------------------------------------
-- The compound one
-- ---------------------------------------------------------------------------
--
-- (userId, permission, resourceId), where a NULL resourceId means the grant
-- applies account-wide rather than to one object.
--
-- Under PostgreSQL the NULLs were distinct, so this index never constrained
-- account-wide grants at all -- which is why grantPermission finds the row and
-- branches rather than calling upsert. Filtering to the rows that name a
-- resource keeps that behaviour, and keeps the service code correct as written.
--
-- Making it unique across the NULLs instead would arguably be the better rule,
-- since a user has either got a permission account-wide or they have not. But
-- that is a behaviour change with a data migration behind it -- two existing
-- account-wide grants for one user would have to be reconciled -- and it does
-- not belong in a port.
ALTER TABLE dbo.[user_permission_grants] DROP CONSTRAINT [user_permission_grants_userId_permission_resourceId_key];
CREATE UNIQUE INDEX [user_permission_grants_userId_permission_resourceId_key]
  ON dbo.[user_permission_grants] ([userId], [permission], [resourceId])
  WHERE [resourceId] IS NOT NULL;
