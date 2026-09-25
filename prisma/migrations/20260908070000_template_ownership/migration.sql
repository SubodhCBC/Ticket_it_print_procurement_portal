-- Templates gain an owner, so a customer can have their own.
--
-- ---------------------------------------------------------------------------
-- The model
-- ---------------------------------------------------------------------------
-- Until now every template was the operator's: TEMPLATE_MANAGE is in no
-- customer role, and `visibility` only chose between "everyone" and "these
-- named accounts". Customers can now build too, and who may see a template
-- follows from who made it:
--
--   ALL_ACCOUNTS  the operator's library, visible to everyone      (unchanged)
--   RESTRICTED    the operator's, granted to named accounts        (unchanged)
--   ACCOUNT       a head office's, visible to that account's users (new)
--   PRIVATE       a site user's own, visible to nobody else        (new)
--
-- `ownerUserId` is what lets a site user run the full builder on their own copy
-- without being handed TEMPLATE_MANAGE — which would also let them edit, publish
-- and delete the operator's originals. Authorisation becomes "you hold
-- TEMPLATE_MANAGE, or you own this", which is a rule about the row rather than
-- about the person.
--
-- `ownerAccountId` is denormalised from the owner so the visibility predicate
-- can filter without a join, for the same reason the tenant columns elsewhere
-- carry an accountId they could have looked up.
--
-- `sourceTemplateId` is provenance, not behaviour. It answers "which of ours did
-- this come from" about a design the customer has since edited beyond
-- recognition.
--
-- ---------------------------------------------------------------------------
-- Why this is hand-written
-- ---------------------------------------------------------------------------
-- `prisma migrate dev` was asked what it would generate for this change, and the
-- first thing on its list was thirty-six of these:
--
--   ALTER TABLE [accounts] DROP CONSTRAINT [accounts_createdAt_df];
--   ALTER TABLE [accounts] ADD CONSTRAINT [accounts_createdAt_df]
--     DEFAULT CURRENT_TIMESTAMP FOR [createdAt];
--
-- which is exactly the reversion 20260908050000 exists to prevent: CURRENT_TIMESTAMP
-- is GETDATE(), the server's local clock, labelled as UTC. Prisma has no way to
-- express "UTC" in schema.prisma, so it reads the correct defaults as drift and
-- offers to undo them, quietly, alongside the change actually being asked for.
--
-- So this file contains the template change and nothing else. Apply it with
-- `prisma migrate deploy`, which applies migration folders without diffing, and
-- run `npm run verify:schema` afterwards.

ALTER TABLE dbo.[templates] ADD
  [ownerUserId]      NVARCHAR(64) NULL,
  [ownerAccountId]   NVARCHAR(64) NULL,
  [sourceTemplateId] NVARCHAR(64) NULL;

-- Everything after the column addition runs through EXEC.
--
-- Prisma sends a migration as one batch and SQL Server compiles a batch before
-- it runs any of it, so a statement that names a column added earlier in the
-- same batch fails to compile with "Invalid column name". EXEC defers the
-- compilation to execution time, by which point the columns exist.


EXEC('
ALTER TABLE dbo.[templates]
  ADD CONSTRAINT [templates_ownerUserId_fkey]
  FOREIGN KEY ([ownerUserId]) REFERENCES dbo.[users]([id])
  ON DELETE NO ACTION ON UPDATE NO ACTION
');

EXEC('
ALTER TABLE dbo.[templates]
  ADD CONSTRAINT [templates_ownerAccountId_fkey]
  FOREIGN KEY ([ownerAccountId]) REFERENCES dbo.[accounts]([id])
  ON DELETE NO ACTION ON UPDATE NO ACTION
');

-- Self-referential, and NO ACTION on both sides because SQL Server refuses a
-- cascade path that returns to the table it started from.
EXEC('
ALTER TABLE dbo.[templates]
  ADD CONSTRAINT [templates_sourceTemplateId_fkey]
  FOREIGN KEY ([sourceTemplateId]) REFERENCES dbo.[templates]([id])
  ON DELETE NO ACTION ON UPDATE NO ACTION
');

EXEC('
CREATE NONCLUSTERED INDEX [templates_ownerUserId_idx]
  ON dbo.[templates] ([ownerUserId])
');

-- The shape the visibility predicate asks for: an account's templates, filtered
-- by which kind they are.
EXEC('
CREATE NONCLUSTERED INDEX [templates_ownerAccountId_visibility_idx]
  ON dbo.[templates] ([ownerAccountId], [visibility])
');

-- The closed set grows by two. Replaced rather than widened because a CHECK
-- constraint cannot be altered in place.
EXEC('
ALTER TABLE dbo.[templates] DROP CONSTRAINT [templates_visibility_enum]
');

EXEC('
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_visibility_enum]
  CHECK ([visibility] IN (''ALL_ACCOUNTS'', ''RESTRICTED'', ''ACCOUNT'', ''PRIVATE''))
');

-- A customer-owned template must say whose it is, and an operator-owned one
-- must not. Stated here because it is the invariant every read below relies on:
-- a PRIVATE row with no owner would be visible to nobody and editable by
-- nobody, and an ALL_ACCOUNTS row with an owner would be one customer's design
-- published to every other.
EXEC('
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_owner_matches_visibility]
  CHECK (
    ([visibility] IN (''ALL_ACCOUNTS'', ''RESTRICTED'') AND [ownerUserId] IS NULL AND [ownerAccountId] IS NULL)
    OR ([visibility] = ''ACCOUNT'' AND [ownerAccountId] IS NOT NULL)
    OR ([visibility] = ''PRIVATE'' AND [ownerUserId] IS NOT NULL AND [ownerAccountId] IS NOT NULL)
  )
');
