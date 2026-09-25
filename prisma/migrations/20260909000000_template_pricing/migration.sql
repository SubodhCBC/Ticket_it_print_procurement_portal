-- A template carries its own price, and that price is what a buyer pays.
--
-- ---------------------------------------------------------------------------
-- The model
-- ---------------------------------------------------------------------------
-- Until now every price was the product's: `basePrice` for one `uom`, the
-- public ladder in `product_volume_tiers`, and an account's negotiated terms in
-- `rate_cards`. A template had no price at all and was quoted by whatever
-- product it happened to be linked to.
--
-- That is the wrong end of the thing for a web-to-print catalogue. The stock is
-- the cheap half; what a job costs is decided by the design that goes on it. So
-- the price moves onto the design:
--
--   price         what one pack of this design costs
--   unitsPerPack  how many pieces are in that pack
--
-- A cart quantity of 2 is two packs, not two pieces — quantity keeps counting
-- in the product's `uom` exactly as it did, so MOQ, order multiples and stock
-- reservation are all untouched. `unitsPerPack` is there so a storefront can
-- print "2.50 each" beside "250.00", and for the publish-time check that a
-- stocked product's pack size and its design's agree. It is never multiplied by
-- to reach a line total.
--
-- Both columns are NULL-able. A draft is allowed to be half-built, and every
-- template that exists today predates the idea of a price; making the column
-- NOT NULL would mean inventing a number for each of them. `assertPublishable`
-- is what refuses to publish an unpriced design, which puts the rule where the
-- other publish rules already live and leaves drafts alone.
--
-- ---------------------------------------------------------------------------
-- Why the version table gets a copy
-- ---------------------------------------------------------------------------
-- `template_versions.snapshot` already freezes everything about a published
-- design, and the price goes in there too. These two columns are a second copy
-- of the same two numbers, on purpose: pricing a basket reads the frozen price
-- once per line, and a number reachable only by parsing an NVARCHAR(MAX)
-- document is one the database cannot join on, filter by or index. The snapshot
-- remains the record of what was published; these are the copy the pricing path
-- reads.
--
-- ---------------------------------------------------------------------------
-- Two things this migration deliberately does not do
-- ---------------------------------------------------------------------------
-- It does not touch `rate_cards`, `rate_card_items` or `rate_card_tiers`, even
-- though they stop pricing anything. Those three tables are reached by
-- `dbo.rls_fn_rate_card_item_predicate` and `dbo.rls_fn_rate_card_tier_predicate`,
-- which are WITH SCHEMABINDING and belong to `dbo.rls_tenant_isolation`;
-- altering them means taking the whole policy off, dropping it, and rebuilding
-- all twenty-three tables' worth of predicates. The pricing path simply stops
-- consulting them, which is reversible and costs nothing.
--
-- It does not touch `order_line_items.priceSource` either. That column is a
-- plain NVARCHAR(500) with no CHECK behind it, so the new 'TEMPLATE_PRICE'
-- value needs no schema change — only the TypeScript union.
--
-- ---------------------------------------------------------------------------
-- Why this is hand-written
-- ---------------------------------------------------------------------------
-- The same reason as 20260908070000: `prisma migrate dev` reads the UTC column
-- defaults from 20260908050000 and the filtered unique indexes from
-- 20260907160000 as drift, and offers to undo them alongside whatever change is
-- actually being asked for. Apply with `prisma migrate deploy`, then run
-- `npm run verify:schema`.
--
-- Note for that script: this adds two business-rule CHECKs, so its expected
-- count moves from 37 to 39. It is updated in the same commit.

ALTER TABLE dbo.[templates] ADD
  [price]        DECIMAL(12,2) NULL,
  [unitsPerPack] INT NULL;

ALTER TABLE dbo.[template_versions] ADD
  [price]        DECIMAL(12,2) NULL,
  [unitsPerPack] INT NULL;

-- Everything after the column additions runs through EXEC.
--
-- Prisma sends a migration as one batch and SQL Server compiles a batch before
-- it runs any of it, so a statement naming a column added earlier in the same
-- batch fails to compile with "Invalid column name". EXEC defers compilation to
-- execution time, by which point the columns exist.


-- The pair moves together or not at all: a price with no pack size cannot be
-- rendered ("250.00" for how many?), and a pack size with no price is a fact
-- about nothing. The same idiom as `cart_lines_template_pair`, and for the same
-- reason — a half-set pair is a state no reader has a sensible answer for.
--
-- Spelled out as AND/OR rather than as `(a IS NULL) = (b IS NULL)`. T-SQL has
-- no boolean type: `IS NULL` yields a predicate, not a value, so comparing two
-- of them with `=` is a syntax error rather than the tidier phrasing it looks
-- like. That is the PostgreSQL spelling, and this file is SQL Server.
--
-- Stated on the draft table only. A version is written by `publishTemplate`,
-- which runs after `assertPublishable` has already required both; constraining
-- it again would reject a version restored from a design published before this
-- migration, which is a real row with a real history and no price.
EXEC('
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_price_pair]
  CHECK (
    ([price] IS NULL AND [unitsPerPack] IS NULL)
    OR ([price] IS NOT NULL AND [unitsPerPack] IS NOT NULL)
  )
');

-- Negative money is never a valid answer, and zero is: a design given away as
-- part of a campaign is priced at nothing on purpose. A pack, though, is at
-- least one piece — zero pieces per pack would make the "each" figure a
-- division by zero on every storefront that prints it.
EXEC('
ALTER TABLE dbo.[templates] ADD CONSTRAINT [templates_price_non_negative]
  CHECK ([price] IS NULL OR ([price] >= 0 AND [unitsPerPack] >= 1))
');
