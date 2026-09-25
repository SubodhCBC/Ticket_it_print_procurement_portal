-- Widen templates.canvasJson to NVARCHAR(MAX).
--
-- It was NVARCHAR(500). The move from PostgreSQL gave every String column an
-- explicit width, and this one -- a `text` column on the original -- kept
-- Prisma's default instead of Max, alongside `canvasConfig`, `layers` and
-- `design`, which all got it.
--
-- 500 characters is smaller than any real canvas: fabric's toJSON runs to
-- kilobytes for an empty artboard and megabytes once a picture is on it. So
-- every save and every publish from the builder failed with P2000, "the
-- provided value for the column is too long". Nothing caught it because no
-- API-level test sends a canvasJson -- they build templates from `layers`,
-- which was Max all along.
--
-- No data can be lost: the column is only ever widened, and anything already
-- stored fit in 500 characters.

ALTER TABLE [dbo].[templates] ALTER COLUMN [canvasJson] NVARCHAR(MAX) NULL;
