-- Record which document-library file an asset was copied from.
--
-- Catalogue and template artwork now comes from the DAM: the portal copies the
-- file into object storage on attach and keeps the library reference alongside
-- it. Two changes are needed for that reference to be usable.
--
-- 1. product_assets gains damDocumentId.
--
--    template_assets has had one since the initial migration; product_assets
--    never did, so a product image's origin was only recoverable from the audit
--    log. It is needed on the row now, not just in the log, because removing an
--    asset also removes the file from the library -- which cannot be done
--    without knowing which file it was.
--
-- 2. Both columns widen from NVARCHAR(64) to NVARCHAR(512).
--
--    A library file has no id. It is identified by its folder and its name
--    together -- "Products/prd_01J9Z.../dog-mu2kwhlv-y2d.jpg" -- which passes 64
--    characters as soon as the folder is named after a record. A truncated
--    reference is not merely lossy: it names no file at all, so the unlink on
--    delete would silently do nothing. 512 matches filename/contentType on the
--    same tables.
--
-- No data can be lost. The column is only ever widened, everything already
-- stored fit in 64 characters, and the new column is nullable -- every existing
-- row keeps a NULL, which reads correctly as "this did not come from the
-- library".

ALTER TABLE [dbo].[template_assets] ALTER COLUMN [damDocumentId] NVARCHAR(512) NULL;

ALTER TABLE [dbo].[product_assets] ADD [damDocumentId] NVARCHAR(512) NULL;
