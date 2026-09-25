-- Checkout gains a delivery choice, and a stock choice can cost more.
--
-- ---------------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------------
-- Until now an order carried no delivery charge: `total` was the subtotal, and
-- every screen that mentioned freight said it was included. The buyer now picks
-- how the parcel travels — CourierPost Express next day, or a standard parcel in
-- two to three days — and the order pays for it.
--
--   carts.shippingMethod    the choice, saved by the checkout stepper
--   orders.shippingMethod   the same choice, copied at placement
--   orders.shippingCost     what it added, frozen like every other number on
--                           an order
--
-- `orders.total` is now subtotal plus shippingCost. The column already meant
-- "what this order costs"; only what placement writes into it changes. Every
-- order placed before this gets shippingCost 0 from the default, and its total
-- already equals its subtotal, which is exactly what it cost — so the back-fill
-- is correct rather than an invented charge.
--
-- The methods and their prices are a code list in
-- src/server/cart/shipping-methods.ts, not a table: two courier services priced
-- by the operator's own contract are not worth an admin screen. The CHECKs
-- below name the same two codes and move with that file.
--
-- ---------------------------------------------------------------------------
-- Stock that costs more
-- ---------------------------------------------------------------------------
-- A product's option values have been plain strings. `valuePrices` lets a value
-- add to the price of one pack — {"Gloss Laminate": "30.00"} — so a design
-- printed on a laminated stock costs its pack price plus thirty. A value absent
-- from the map adds nothing, which is every value that exists today.
--
-- A map beside the list rather than objects inside it: `values` is read as a
-- list of strings by variant validation, the importer and every product screen,
-- and changing its shape would change all of them to carry a number that only
-- the pricing path reads.
--
-- `order_line_items.options` freezes the chosen values at placement —
-- {"Finish": "Gloss Laminate"} — for the reason the SKU and name are copied:
-- a variant reconfigured next year must not change what this order says was
-- printed.
--
-- ---------------------------------------------------------------------------
-- Why this is hand-written
-- ---------------------------------------------------------------------------
-- As 20260909000000: `prisma migrate dev` would take the UTC defaults and the
-- filtered unique indexes with it. Apply with `prisma migrate deploy`, then run
-- `npm run verify:schema`. This adds two enum CHECKs (42 -> 44), two ISJSON
-- CHECKs (11 -> 13) and one business-rule CHECK (39 -> 40); the script is
-- updated in the same commit.

ALTER TABLE dbo.[product_options] ADD [valuePrices] NVARCHAR(MAX) NULL;

ALTER TABLE dbo.[carts] ADD [shippingMethod] VARCHAR(32) NULL;

ALTER TABLE dbo.[orders] ADD
  [shippingMethod] VARCHAR(32) NULL,
  [shippingCost]   DECIMAL(12,2) NOT NULL
    CONSTRAINT [orders_shippingCost_df] DEFAULT 0;

ALTER TABLE dbo.[order_line_items] ADD [options] NVARCHAR(MAX) NULL;

-- Everything after the column additions runs through EXEC, for the reason
-- 20260909000000 gives: SQL Server compiles the whole batch before running any
-- of it, so a statement naming a column added earlier in the same batch fails
-- with "Invalid column name" unless its compilation is deferred.

EXEC('
ALTER TABLE dbo.[carts] ADD CONSTRAINT [carts_shippingMethod_enum]
  CHECK ([shippingMethod] IS NULL OR [shippingMethod] IN (''COURIERPOST_EXPRESS'', ''STANDARD_PARCEL''))
');

EXEC('
ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_shippingMethod_enum]
  CHECK ([shippingMethod] IS NULL OR [shippingMethod] IN (''COURIERPOST_EXPRESS'', ''STANDARD_PARCEL''))
');

-- A delivery charge is never a refund.
EXEC('
ALTER TABLE dbo.[orders] ADD CONSTRAINT [orders_shippingCost_non_negative]
  CHECK ([shippingCost] >= 0)
');

EXEC('
ALTER TABLE dbo.[product_options] ADD CONSTRAINT [product_options_valuePrices_is_json]
  CHECK ([valuePrices] IS NULL OR ISJSON([valuePrices]) = 1)
');

EXEC('
ALTER TABLE dbo.[order_line_items] ADD CONSTRAINT [order_line_items_options_is_json]
  CHECK ([options] IS NULL OR ISJSON([options]) = 1)
');
