BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[accounts] (
    [id] NVARCHAR(64) NOT NULL,
    [slug] NVARCHAR(255) NOT NULL,
    [accountCode] NVARCHAR(255) NOT NULL,
    [legacyClient] NVARCHAR(500),
    [name] NVARCHAR(255) NOT NULL,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [accounts_status_df] DEFAULT 'ACTIVE',
    [contactEmail] NVARCHAR(500),
    [contactPhone] NVARCHAR(500),
    [approvalThreshold] DECIMAL(12,2),
    [requirePoNumber] BIT NOT NULL CONSTRAINT [accounts_requirePoNumber_df] DEFAULT 0,
    [poPrefix] NVARCHAR(500),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [accounts_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [accounts_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [accounts_slug_key] UNIQUE NONCLUSTERED ([slug]),
    CONSTRAINT [accounts_accountCode_key] UNIQUE NONCLUSTERED ([accountCode])
);

-- CreateTable
CREATE TABLE [dbo].[account_settings] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [currency] NVARCHAR(500) NOT NULL CONSTRAINT [account_settings_currency_df] DEFAULT 'USD',
    [timezone] NVARCHAR(500) NOT NULL CONSTRAINT [account_settings_timezone_df] DEFAULT 'UTC',
    [orderNumberPrefix] NVARCHAR(500),
    [enforceMoq] BIT NOT NULL CONSTRAINT [account_settings_enforceMoq_df] DEFAULT 1,
    [allowBackorders] BIT NOT NULL CONSTRAINT [account_settings_allowBackorders_df] DEFAULT 0,
    [requireDeliveryNotes] BIT NOT NULL CONSTRAINT [account_settings_requireDeliveryNotes_df] DEFAULT 0,
    [sendOrderConfirmations] BIT NOT NULL CONSTRAINT [account_settings_sendOrderConfirmations_df] DEFAULT 1,
    [notificationEmail] NVARCHAR(500),
    [sendLowStockAlerts] BIT NOT NULL CONSTRAINT [account_settings_sendLowStockAlerts_df] DEFAULT 1,
    [lowStockAlertThreshold] INT NOT NULL CONSTRAINT [account_settings_lowStockAlertThreshold_df] DEFAULT 50,
    [sendMonthlyBillingDigest] BIT NOT NULL CONSTRAINT [account_settings_sendMonthlyBillingDigest_df] DEFAULT 1,
    [sessionTimeoutMinutes] INT NOT NULL CONSTRAINT [account_settings_sessionTimeoutMinutes_df] DEFAULT 60,
    [enforceTwoFactor] BIT NOT NULL CONSTRAINT [account_settings_enforceTwoFactor_df] DEFAULT 0,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [account_settings_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [account_settings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [account_settings_accountId_key] UNIQUE NONCLUSTERED ([accountId])
);

-- CreateTable
CREATE TABLE [dbo].[sites] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [code] NVARCHAR(255) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [legacyOutletId] INT,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [sites_status_df] DEFAULT 'ACTIVE',
    [monthlyBudget] DECIMAL(12,2),
    [poRequired] BIT NOT NULL CONSTRAINT [sites_poRequired_df] DEFAULT 0,
    [poPrefix] NVARCHAR(500),
    [costCentre] NVARCHAR(500),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [sites_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [sites_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [sites_legacyOutletId_key] UNIQUE NONCLUSTERED ([legacyOutletId]),
    CONSTRAINT [sites_accountId_code_key] UNIQUE NONCLUSTERED ([accountId],[code])
);

-- CreateTable
CREATE TABLE [dbo].[addresses] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [siteId] NVARCHAR(64),
    [kind] VARCHAR(32) NOT NULL,
    [label] NVARCHAR(500),
    [recipientName] NVARCHAR(500),
    [line1] NVARCHAR(500) NOT NULL,
    [line2] NVARCHAR(500),
    [city] NVARCHAR(500) NOT NULL,
    [region] NVARCHAR(500),
    [postcode] NVARCHAR(500) NOT NULL,
    [country] CHAR(2) NOT NULL,
    [phone] NVARCHAR(500),
    [isDefault] BIT NOT NULL CONSTRAINT [addresses_isDefault_df] DEFAULT 0,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [addresses_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [addresses_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(64) NOT NULL,
    [identityUserId] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [users_identityUserId_df] DEFAULT newid(),
    [accountId] NVARCHAR(64) NOT NULL,
    [siteId] NVARCHAR(64),
    [userType] VARCHAR(32) NOT NULL CONSTRAINT [users_userType_df] DEFAULT 'EXISTING',
    [legacyUserId] INT,
    [login] NVARCHAR(255) NOT NULL,
    [loginDisplay] NVARCHAR(500) NOT NULL,
    [email] NVARCHAR(255) NOT NULL,
    [firstName] NVARCHAR(500) NOT NULL,
    [lastName] NVARCHAR(500) NOT NULL,
    [phone] NVARCHAR(500),
    [passwordHash] NVARCHAR(500),
    [role] VARCHAR(32) NOT NULL,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [users_status_df] DEFAULT 'ACTIVE',
    [legacyRoleName] NVARCHAR(500),
    [legacyRegionName] NVARCHAR(500),
    [legacyGroupName] NVARCHAR(500),
    [legacyOutletId] INT,
    [isHeadOfficeAdmin] BIT NOT NULL CONSTRAINT [users_isHeadOfficeAdmin_df] DEFAULT 0,
    [mustChangePassword] BIT NOT NULL CONSTRAINT [users_mustChangePassword_df] DEFAULT 0,
    [legacySyncedAt] DATETIMEOFFSET,
    [legacyFingerprint] NVARCHAR(500),
    [department] NVARCHAR(500),
    [monthlyBudgetCap] DECIMAL(12,2),
    [poPrefix] NVARCHAR(500),
    [lastLoginAt] DATETIMEOFFSET,
    [activatedAt] DATETIMEOFFSET,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_identityUserId_key] UNIQUE NONCLUSTERED ([identityUserId]),
    CONSTRAINT [users_legacyUserId_key] UNIQUE NONCLUSTERED ([legacyUserId]),
    CONSTRAINT [users_login_key] UNIQUE NONCLUSTERED ([login])
);

-- CreateTable
CREATE TABLE [dbo].[audit_log_entries] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [actorId] NVARCHAR(64),
    [actorName] NVARCHAR(500) NOT NULL,
    [actorEmail] NVARCHAR(500) NOT NULL,
    [actorRole] NVARCHAR(500) NOT NULL,
    [action] NVARCHAR(500) NOT NULL,
    [entityType] VARCHAR(32) NOT NULL,
    [entityId] NVARCHAR(64) NOT NULL,
    [entityName] NVARCHAR(500),
    [details] NVARCHAR(max),
    [ipAddress] NVARCHAR(500),
    [userAgent] NVARCHAR(max),
    [requestId] NVARCHAR(64),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [audit_log_entries_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_log_entries_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[user_site_access] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [userId] NVARCHAR(64) NOT NULL,
    [siteId] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [user_site_access_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [user_site_access_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [user_site_access_userId_siteId_key] UNIQUE NONCLUSTERED ([userId],[siteId])
);

-- CreateTable
CREATE TABLE [dbo].[user_permission_grants] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [userId] NVARCHAR(64) NOT NULL,
    [permission] NVARCHAR(255) NOT NULL,
    [effect] VARCHAR(32) NOT NULL CONSTRAINT [user_permission_grants_effect_df] DEFAULT 'ALLOW',
    [resourceId] NVARCHAR(64),
    [grantedById] NVARCHAR(64),
    [reason] NVARCHAR(max),
    [expiresAt] DATETIMEOFFSET,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [user_permission_grants_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [user_permission_grants_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [user_permission_grants_userId_permission_resourceId_key] UNIQUE NONCLUSTERED ([userId],[permission],[resourceId])
);

-- CreateTable
CREATE TABLE [dbo].[invitations] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [siteId] NVARCHAR(64),
    [email] NVARCHAR(255) NOT NULL,
    [firstName] NVARCHAR(500) NOT NULL,
    [lastName] NVARCHAR(500) NOT NULL,
    [role] VARCHAR(32) NOT NULL,
    [userType] VARCHAR(32) NOT NULL,
    [tokenHash] NVARCHAR(255) NOT NULL,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [invitations_status_df] DEFAULT 'PENDING',
    [expiresAt] DATETIMEOFFSET NOT NULL,
    [acceptedAt] DATETIMEOFFSET,
    [acceptedUserId] NVARCHAR(64),
    [revokedAt] DATETIMEOFFSET,
    [invitedById] NVARCHAR(64),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [invitations_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [invitations_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [invitations_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash]),
    CONSTRAINT [invitations_acceptedUserId_key] UNIQUE NONCLUSTERED ([acceptedUserId])
);

-- CreateTable
CREATE TABLE [dbo].[password_reset_tokens] (
    [id] NVARCHAR(64) NOT NULL,
    [userId] NVARCHAR(64) NOT NULL,
    [tokenHash] NVARCHAR(255) NOT NULL,
    [expiresAt] DATETIMEOFFSET NOT NULL,
    [usedAt] DATETIMEOFFSET,
    [ip] NVARCHAR(500),
    [userAgent] NVARCHAR(max),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [password_reset_tokens_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [password_reset_tokens_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [password_reset_tokens_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[refresh_tokens] (
    [id] NVARCHAR(64) NOT NULL,
    [userId] NVARCHAR(64) NOT NULL,
    [tokenHash] NVARCHAR(255) NOT NULL,
    [rotatedToId] NVARCHAR(64),
    [expiresAt] DATETIMEOFFSET NOT NULL,
    [revokedAt] DATETIMEOFFSET,
    [ip] NVARCHAR(500),
    [userAgent] NVARCHAR(max),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [refresh_tokens_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [refresh_tokens_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [refresh_tokens_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash]),
    CONSTRAINT [refresh_tokens_rotatedToId_key] UNIQUE NONCLUSTERED ([rotatedToId])
);

-- CreateTable
CREATE TABLE [dbo].[product_categories] (
    [id] NVARCHAR(64) NOT NULL,
    [code] NVARCHAR(255) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(max),
    [sortOrder] INT NOT NULL CONSTRAINT [product_categories_sortOrder_df] DEFAULT 0,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [product_categories_status_df] DEFAULT 'ACTIVE',
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [product_categories_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [product_categories_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [product_categories_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[products] (
    [id] NVARCHAR(64) NOT NULL,
    [sku] NVARCHAR(255) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(max),
    [categoryId] NVARCHAR(64) NOT NULL,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [products_status_df] DEFAULT 'DRAFT',
    [visibility] VARCHAR(32) NOT NULL CONSTRAINT [products_visibility_df] DEFAULT 'ALL_ACCOUNTS',
    [basePrice] DECIMAL(12,2) NOT NULL,
    [moq] INT NOT NULL CONSTRAINT [products_moq_df] DEFAULT 1,
    [orderMultiple] INT NOT NULL CONSTRAINT [products_orderMultiple_df] DEFAULT 1,
    [packSize] INT NOT NULL CONSTRAINT [products_packSize_df] DEFAULT 1,
    [uom] VARCHAR(32) NOT NULL CONSTRAINT [products_uom_df] DEFAULT 'EACH',
    [widthMm] INT,
    [heightMm] INT,
    [depthMm] INT,
    [weightGrams] INT,
    [bleedMm] DECIMAL(5,2),
    [safeMarginMm] DECIMAL(5,2),
    [trackInventory] BIT NOT NULL CONSTRAINT [products_trackInventory_df] DEFAULT 1,
    [stockOnHand] INT NOT NULL CONSTRAINT [products_stockOnHand_df] DEFAULT 0,
    [lowStockThreshold] INT NOT NULL CONSTRAINT [products_lowStockThreshold_df] DEFAULT 0,
    [stockReserved] INT NOT NULL CONSTRAINT [products_stockReserved_df] DEFAULT 0,
    [reorderQuantity] INT,
    [leadTimeDays] INT,
    [supersededById] NVARCHAR(64),
    [tags] NVARCHAR(max) NOT NULL CONSTRAINT [products_tags_df] DEFAULT '[]',
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [products_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [products_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [products_sku_key] UNIQUE NONCLUSTERED ([sku])
);

-- CreateTable
CREATE TABLE [dbo].[product_options] (
    [id] NVARCHAR(64) NOT NULL,
    [productId] NVARCHAR(64) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [values] NVARCHAR(max) NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [product_options_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [product_options_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [product_options_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [product_options_productId_name_key] UNIQUE NONCLUSTERED ([productId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[product_variants] (
    [id] NVARCHAR(64) NOT NULL,
    [productId] NVARCHAR(64) NOT NULL,
    [sku] NVARCHAR(255) NOT NULL,
    [attributes] NVARCHAR(max) NOT NULL,
    [priceOverride] DECIMAL(12,2),
    [stockOnHand] INT NOT NULL CONSTRAINT [product_variants_stockOnHand_df] DEFAULT 0,
    [stockReserved] INT NOT NULL CONSTRAINT [product_variants_stockReserved_df] DEFAULT 0,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [product_variants_status_df] DEFAULT 'ACTIVE',
    [sortOrder] INT NOT NULL CONSTRAINT [product_variants_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [product_variants_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [product_variants_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [product_variants_sku_key] UNIQUE NONCLUSTERED ([sku])
);

-- CreateTable
CREATE TABLE [dbo].[product_volume_tiers] (
    [id] NVARCHAR(64) NOT NULL,
    [productId] NVARCHAR(64) NOT NULL,
    [minQuantity] INT NOT NULL,
    [discountPercent] DECIMAL(5,2) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [product_volume_tiers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [product_volume_tiers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [product_volume_tiers_productId_minQuantity_key] UNIQUE NONCLUSTERED ([productId],[minQuantity])
);

-- CreateTable
CREATE TABLE [dbo].[product_assets] (
    [id] NVARCHAR(64) NOT NULL,
    [productId] NVARCHAR(64) NOT NULL,
    [kind] VARCHAR(32) NOT NULL CONSTRAINT [product_assets_kind_df] DEFAULT 'IMAGE',
    [storageKey] NVARCHAR(255) NOT NULL,
    [filename] NVARCHAR(500) NOT NULL,
    [contentType] NVARCHAR(500) NOT NULL,
    [sizeBytes] INT NOT NULL,
    [altText] NVARCHAR(max),
    [widthPx] INT,
    [heightPx] INT,
    [derivativeStatus] VARCHAR(32) NOT NULL CONSTRAINT [product_assets_derivativeStatus_df] DEFAULT 'NOT_APPLICABLE',
    [thumbnailKey] NVARCHAR(500),
    [previewKey] NVARCHAR(500),
    [derivativeError] NVARCHAR(max),
    [sortOrder] INT NOT NULL CONSTRAINT [product_assets_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [product_assets_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [product_assets_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [product_assets_storageKey_key] UNIQUE NONCLUSTERED ([storageKey])
);

-- CreateTable
CREATE TABLE [dbo].[product_account_visibility] (
    [id] NVARCHAR(64) NOT NULL,
    [productId] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [product_account_visibility_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [product_account_visibility_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [product_account_visibility_productId_accountId_key] UNIQUE NONCLUSTERED ([productId],[accountId])
);

-- CreateTable
CREATE TABLE [dbo].[catalog_import_jobs] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [requestedById] NVARCHAR(64),
    [status] VARCHAR(32) NOT NULL CONSTRAINT [catalog_import_jobs_status_df] DEFAULT 'QUEUED',
    [dryRun] BIT NOT NULL CONSTRAINT [catalog_import_jobs_dryRun_df] DEFAULT 0,
    [updateExisting] BIT NOT NULL CONSTRAINT [catalog_import_jobs_updateExisting_df] DEFAULT 0,
    [payload] NVARCHAR(max) NOT NULL,
    [totalRows] INT NOT NULL CONSTRAINT [catalog_import_jobs_totalRows_df] DEFAULT 0,
    [created] INT NOT NULL CONSTRAINT [catalog_import_jobs_created_df] DEFAULT 0,
    [updated] INT NOT NULL CONSTRAINT [catalog_import_jobs_updated_df] DEFAULT 0,
    [skipped] INT NOT NULL CONSTRAINT [catalog_import_jobs_skipped_df] DEFAULT 0,
    [failed] INT NOT NULL CONSTRAINT [catalog_import_jobs_failed_df] DEFAULT 0,
    [results] NVARCHAR(max),
    [error] NVARCHAR(max),
    [startedAt] DATETIMEOFFSET,
    [finishedAt] DATETIMEOFFSET,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [catalog_import_jobs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [catalog_import_jobs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[rate_cards] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [notes] NVARCHAR(max),
    [status] VARCHAR(32) NOT NULL CONSTRAINT [rate_cards_status_df] DEFAULT 'DRAFT',
    [effectiveFrom] DATETIMEOFFSET NOT NULL,
    [effectiveTo] DATETIMEOFFSET,
    [defaultDiscountPercent] DECIMAL(5,2) NOT NULL CONSTRAINT [rate_cards_defaultDiscountPercent_df] DEFAULT 0,
    [createdById] NVARCHAR(64),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [rate_cards_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [rate_cards_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[rate_card_items] (
    [id] NVARCHAR(64) NOT NULL,
    [rateCardId] NVARCHAR(64) NOT NULL,
    [productId] NVARCHAR(64) NOT NULL,
    [fixedPrice] DECIMAL(12,2),
    [discountPercent] DECIMAL(5,2),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [rate_card_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [rate_card_items_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [rate_card_items_rateCardId_productId_key] UNIQUE NONCLUSTERED ([rateCardId],[productId])
);

-- CreateTable
CREATE TABLE [dbo].[rate_card_tiers] (
    [id] NVARCHAR(64) NOT NULL,
    [rateCardItemId] NVARCHAR(64) NOT NULL,
    [minQuantity] INT NOT NULL,
    [discountPercent] DECIMAL(5,2) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [rate_card_tiers_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [rate_card_tiers_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [rate_card_tiers_rateCardItemId_minQuantity_key] UNIQUE NONCLUSTERED ([rateCardItemId],[minQuantity])
);

-- CreateTable
CREATE TABLE [dbo].[carts] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [userId] NVARCHAR(64) NOT NULL,
    [siteId] NVARCHAR(64),
    [status] VARCHAR(32) NOT NULL CONSTRAINT [carts_status_df] DEFAULT 'OPEN',
    [poNumber] NVARCHAR(500),
    [campaignCode] NVARCHAR(500),
    [notes] NVARCHAR(max),
    [requestedDeliveryDate] DATETIMEOFFSET,
    [shippingAddressId] NVARCHAR(64),
    [billingAddressId] NVARCHAR(64),
    [paymentMethod] VARCHAR(32),
    [termsAcceptedAt] DATETIMEOFFSET,
    [checkedOutAt] DATETIMEOFFSET,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [carts_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [carts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[cart_lines] (
    [id] NVARCHAR(64) NOT NULL,
    [cartId] NVARCHAR(64) NOT NULL,
    [productId] NVARCHAR(64) NOT NULL,
    [variantId] NVARCHAR(64),
    [quantity] INT NOT NULL,
    [templateId] NVARCHAR(64),
    [templateVersionId] NVARCHAR(64),
    [customisation] NVARCHAR(max),
    [notes] NVARCHAR(max),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [cart_lines_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [cart_lines_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[orders] (
    [id] NVARCHAR(64) NOT NULL,
    [orderNumber] NVARCHAR(255) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [siteId] NVARCHAR(64) NOT NULL,
    [placedById] NVARCHAR(64) NOT NULL,
    [placedByName] NVARCHAR(500) NOT NULL,
    [placedByEmail] NVARCHAR(500) NOT NULL,
    [cartId] NVARCHAR(64),
    [status] VARCHAR(32) NOT NULL CONSTRAINT [orders_status_df] DEFAULT 'DRAFT',
    [paymentStatus] VARCHAR(32) NOT NULL CONSTRAINT [orders_paymentStatus_df] DEFAULT 'UNPAID',
    [paymentMethod] VARCHAR(32),
    [paymentReference] NVARCHAR(500),
    [paidAt] DATETIMEOFFSET,
    [poNumber] NVARCHAR(500),
    [campaignCode] NVARCHAR(500),
    [projectCode] NVARCHAR(500),
    [requiresApproval] BIT NOT NULL CONSTRAINT [orders_requiresApproval_df] DEFAULT 0,
    [approvedById] NVARCHAR(64),
    [approvedAt] DATETIMEOFFSET,
    [rejectionReason] NVARCHAR(500),
    [changeRequestNote] NVARCHAR(500),
    [subtotal] DECIMAL(12,2) NOT NULL,
    [catalogSubtotal] DECIMAL(12,2) NOT NULL,
    [total] DECIMAL(12,2) NOT NULL,
    [rateCardId] NVARCHAR(64),
    [rateCardName] NVARCHAR(500),
    [billingPeriod] NVARCHAR(255) NOT NULL,
    [shippingAddressId] NVARCHAR(64),
    [shippingSnapshot] NVARCHAR(max) NOT NULL,
    [recipientName] NVARCHAR(500),
    [recipientPhone] NVARCHAR(500),
    [recipientEmail] NVARCHAR(500),
    [requestedDeliveryDate] DATETIMEOFFSET,
    [carrier] NVARCHAR(500),
    [trackingNumber] NVARCHAR(500),
    [deliveryNotes] NVARCHAR(500),
    [dispatchedAt] DATETIMEOFFSET,
    [deliveredAt] DATETIMEOFFSET,
    [cancelledAt] DATETIMEOFFSET,
    [notes] NVARCHAR(max),
    [termsAcceptedAt] DATETIMEOFFSET,
    [stockState] VARCHAR(32) NOT NULL CONSTRAINT [orders_stockState_df] DEFAULT 'NONE',
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [orders_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [orders_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [orders_orderNumber_key] UNIQUE NONCLUSTERED ([orderNumber]),
    CONSTRAINT [orders_cartId_key] UNIQUE NONCLUSTERED ([cartId])
);

-- CreateTable
CREATE TABLE [dbo].[order_line_items] (
    [id] NVARCHAR(64) NOT NULL,
    [orderId] NVARCHAR(64) NOT NULL,
    [productId] NVARCHAR(64) NOT NULL,
    [variantId] NVARCHAR(64),
    [sku] NVARCHAR(255) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [variantSku] NVARCHAR(500),
    [uom] VARCHAR(32) NOT NULL,
    [packSize] INT NOT NULL,
    [quantity] INT NOT NULL,
    [unitPrice] DECIMAL(12,2) NOT NULL,
    [lineTotal] DECIMAL(12,2) NOT NULL,
    [catalogUnitPrice] DECIMAL(12,2) NOT NULL,
    [discountPercent] DECIMAL(5,2) NOT NULL,
    [priceSource] NVARCHAR(500) NOT NULL,
    [widthMm] INT,
    [heightMm] INT,
    [bleedMm] DECIMAL(5,2),
    [safeMarginMm] DECIMAL(5,2),
    [templateId] NVARCHAR(64),
    [templateVersionId] NVARCHAR(64),
    [customisation] NVARCHAR(max),
    [notes] NVARCHAR(max),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [order_line_items_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [order_line_items_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[order_status_events] (
    [id] NVARCHAR(64) NOT NULL,
    [orderId] NVARCHAR(64) NOT NULL,
    [fromStatus] VARCHAR(32),
    [toStatus] VARCHAR(32) NOT NULL,
    [actorId] NVARCHAR(64),
    [actorName] NVARCHAR(500) NOT NULL,
    [actorRole] VARCHAR(32) NOT NULL,
    [comment] NVARCHAR(max),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [order_status_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [order_status_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[approval_rules] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(max),
    [active] BIT NOT NULL CONSTRAINT [approval_rules_active_df] DEFAULT 1,
    [minTotal] DECIMAL(12,2),
    [categoryId] NVARCHAR(64),
    [requesterRole] VARCHAR(32),
    [siteId] NVARCHAR(64),
    [tier] INT NOT NULL CONSTRAINT [approval_rules_tier_df] DEFAULT 1,
    [approverRole] VARCHAR(32),
    [approverUserId] NVARCHAR(64),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [approval_rules_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [approval_rules_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[approval_requests] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [orderId] NVARCHAR(64) NOT NULL,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [approval_requests_status_df] DEFAULT 'PENDING',
    [currentTier] INT NOT NULL CONSTRAINT [approval_requests_currentTier_df] DEFAULT 1,
    [totalAtRequest] DECIMAL(12,2) NOT NULL,
    [completedAt] DATETIMEOFFSET,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [approval_requests_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [approval_requests_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [approval_requests_orderId_key] UNIQUE NONCLUSTERED ([orderId])
);

-- CreateTable
CREATE TABLE [dbo].[approval_steps] (
    [id] NVARCHAR(64) NOT NULL,
    [requestId] NVARCHAR(64) NOT NULL,
    [ruleId] NVARCHAR(64),
    [tier] INT NOT NULL,
    [approverRole] VARCHAR(32),
    [approverUserId] NVARCHAR(64),
    [status] VARCHAR(32) NOT NULL CONSTRAINT [approval_steps_status_df] DEFAULT 'PENDING',
    [decidedById] NVARCHAR(64),
    [decidedByName] NVARCHAR(500),
    [decidedAt] DATETIMEOFFSET,
    [comment] NVARCHAR(max),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [approval_steps_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [approval_steps_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[invoices] (
    [id] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [invoiceNumber] NVARCHAR(255),
    [billingPeriod] NVARCHAR(255) NOT NULL,
    [status] VARCHAR(32) NOT NULL CONSTRAINT [invoices_status_df] DEFAULT 'DRAFT',
    [subtotal] DECIMAL(12,2) NOT NULL,
    [tax] DECIMAL(12,2) NOT NULL CONSTRAINT [invoices_tax_df] DEFAULT 0,
    [total] DECIMAL(12,2) NOT NULL,
    [orderCount] INT NOT NULL CONSTRAINT [invoices_orderCount_df] DEFAULT 0,
    [siteCount] INT NOT NULL CONSTRAINT [invoices_siteCount_df] DEFAULT 0,
    [issuedAt] DATETIMEOFFSET,
    [dueAt] DATETIMEOFFSET,
    [paidAt] DATETIMEOFFSET,
    [paymentReference] NVARCHAR(500),
    [voidReason] NVARCHAR(500),
    [notes] NVARCHAR(max),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [invoices_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [invoices_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [invoices_invoiceNumber_key] UNIQUE NONCLUSTERED ([invoiceNumber])
);

-- CreateTable
CREATE TABLE [dbo].[invoice_lines] (
    [id] NVARCHAR(64) NOT NULL,
    [invoiceId] NVARCHAR(64) NOT NULL,
    [orderId] NVARCHAR(64) NOT NULL,
    [orderNumber] NVARCHAR(255) NOT NULL,
    [orderedAt] DATETIMEOFFSET NOT NULL,
    [siteId] NVARCHAR(64) NOT NULL,
    [siteCode] NVARCHAR(500) NOT NULL,
    [siteName] NVARCHAR(500) NOT NULL,
    [costCentre] NVARCHAR(500),
    [poNumber] NVARCHAR(500),
    [campaignCode] NVARCHAR(500),
    [itemCount] INT NOT NULL,
    [amount] DECIMAL(12,2) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [invoice_lines_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [invoice_lines_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [invoice_lines_invoiceId_orderId_key] UNIQUE NONCLUSTERED ([invoiceId],[orderId])
);

-- CreateTable
CREATE TABLE [dbo].[invoice_sequences] (
    [year] INT NOT NULL,
    [lastNumber] INT NOT NULL CONSTRAINT [invoice_sequences_lastNumber_df] DEFAULT 0,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [invoice_sequences_pkey] PRIMARY KEY CLUSTERED ([year])
);

-- CreateTable
CREATE TABLE [dbo].[templates] (
    [id] NVARCHAR(64) NOT NULL,
    [code] NVARCHAR(255) NOT NULL,
    [name] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(max),
    [productId] NVARCHAR(64),
    [categoryId] NVARCHAR(64),
    [status] VARCHAR(32) NOT NULL CONSTRAINT [templates_status_df] DEFAULT 'DRAFT',
    [visibility] VARCHAR(32) NOT NULL CONSTRAINT [templates_visibility_df] DEFAULT 'ALL_ACCOUNTS',
    [theme] NVARCHAR(500),
    [orientation] VARCHAR(32) NOT NULL CONSTRAINT [templates_orientation_df] DEFAULT 'PORTRAIT',
    [aspectRatio] NVARCHAR(500),
    [widthValue] DECIMAL(10,3) NOT NULL,
    [heightValue] DECIMAL(10,3) NOT NULL,
    [dimensionUnit] VARCHAR(32) NOT NULL CONSTRAINT [templates_dimensionUnit_df] DEFAULT 'IN',
    [bleedMargin] DECIMAL(10,3) NOT NULL CONSTRAINT [templates_bleedMargin_df] DEFAULT 0,
    [safeMargin] DECIMAL(10,3) NOT NULL CONSTRAINT [templates_safeMargin_df] DEFAULT 0,
    [canvasConfig] NVARCHAR(max) NOT NULL,
    [layers] NVARCHAR(max) NOT NULL,
    [design] NVARCHAR(max),
    [canvasJson] NVARCHAR(500),
    [thumbnailAssetId] NVARCHAR(64),
    [previewAssetId] NVARCHAR(64),
    [version] INT NOT NULL CONSTRAINT [templates_version_df] DEFAULT 1,
    [publishedVersionId] NVARCHAR(64),
    [publishedAt] DATETIMEOFFSET,
    [createdById] NVARCHAR(64),
    [createdByName] NVARCHAR(500),
    [updatedById] NVARCHAR(64),
    [updatedByName] NVARCHAR(500),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [templates_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIMEOFFSET NOT NULL,
    [deletedAt] DATETIMEOFFSET,
    CONSTRAINT [templates_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [templates_code_key] UNIQUE NONCLUSTERED ([code]),
    CONSTRAINT [templates_thumbnailAssetId_key] UNIQUE NONCLUSTERED ([thumbnailAssetId]),
    CONSTRAINT [templates_previewAssetId_key] UNIQUE NONCLUSTERED ([previewAssetId]),
    CONSTRAINT [templates_publishedVersionId_key] UNIQUE NONCLUSTERED ([publishedVersionId])
);

-- CreateTable
CREATE TABLE [dbo].[template_versions] (
    [id] NVARCHAR(64) NOT NULL,
    [templateId] NVARCHAR(64) NOT NULL,
    [version] INT NOT NULL,
    [snapshot] NVARCHAR(max) NOT NULL,
    [label] NVARCHAR(500),
    [createdById] NVARCHAR(64),
    [createdByName] NVARCHAR(500),
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [template_versions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [template_versions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [template_versions_templateId_version_key] UNIQUE NONCLUSTERED ([templateId],[version])
);

-- CreateTable
CREATE TABLE [dbo].[template_assets] (
    [id] NVARCHAR(64) NOT NULL,
    [templateId] NVARCHAR(64) NOT NULL,
    [kind] VARCHAR(32) NOT NULL CONSTRAINT [template_assets_kind_df] DEFAULT 'SOURCE',
    [storageKey] NVARCHAR(255) NOT NULL,
    [filename] NVARCHAR(500) NOT NULL,
    [contentType] NVARCHAR(500) NOT NULL,
    [sizeBytes] INT NOT NULL,
    [altText] NVARCHAR(max),
    [widthPx] INT,
    [heightPx] INT,
    [derivativeStatus] VARCHAR(32) NOT NULL CONSTRAINT [template_assets_derivativeStatus_df] DEFAULT 'NOT_APPLICABLE',
    [thumbnailKey] NVARCHAR(500),
    [previewKey] NVARCHAR(500),
    [derivativeError] NVARCHAR(max),
    [damDocumentId] NVARCHAR(64),
    [sortOrder] INT NOT NULL CONSTRAINT [template_assets_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [template_assets_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [template_assets_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [template_assets_storageKey_key] UNIQUE NONCLUSTERED ([storageKey])
);

-- CreateTable
CREATE TABLE [dbo].[template_account_visibility] (
    [id] NVARCHAR(64) NOT NULL,
    [templateId] NVARCHAR(64) NOT NULL,
    [accountId] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIMEOFFSET NOT NULL CONSTRAINT [template_account_visibility_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [template_account_visibility_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [template_account_visibility_templateId_accountId_key] UNIQUE NONCLUSTERED ([templateId],[accountId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [sites_accountId_status_idx] ON [dbo].[sites]([accountId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [addresses_accountId_idx] ON [dbo].[addresses]([accountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [addresses_siteId_kind_idx] ON [dbo].[addresses]([siteId], [kind]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_accountId_idx] ON [dbo].[users]([accountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_email_idx] ON [dbo].[users]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_siteId_idx] ON [dbo].[users]([siteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_log_entries_accountId_createdAt_idx] ON [dbo].[audit_log_entries]([accountId], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_log_entries_accountId_entityType_entityId_idx] ON [dbo].[audit_log_entries]([accountId], [entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [audit_log_entries_accountId_actorId_createdAt_idx] ON [dbo].[audit_log_entries]([accountId], [actorId], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [user_site_access_accountId_idx] ON [dbo].[user_site_access]([accountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [user_site_access_siteId_idx] ON [dbo].[user_site_access]([siteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [user_permission_grants_accountId_idx] ON [dbo].[user_permission_grants]([accountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [user_permission_grants_userId_expiresAt_idx] ON [dbo].[user_permission_grants]([userId], [expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [invitations_accountId_status_idx] ON [dbo].[invitations]([accountId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [invitations_email_idx] ON [dbo].[invitations]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [invitations_expiresAt_idx] ON [dbo].[invitations]([expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [password_reset_tokens_userId_usedAt_idx] ON [dbo].[password_reset_tokens]([userId], [usedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [password_reset_tokens_expiresAt_idx] ON [dbo].[password_reset_tokens]([expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [refresh_tokens_userId_revokedAt_idx] ON [dbo].[refresh_tokens]([userId], [revokedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [refresh_tokens_expiresAt_idx] ON [dbo].[refresh_tokens]([expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [product_categories_status_sortOrder_idx] ON [dbo].[product_categories]([status], [sortOrder]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [products_categoryId_status_idx] ON [dbo].[products]([categoryId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [products_status_name_idx] ON [dbo].[products]([status], [name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [products_visibility_idx] ON [dbo].[products]([visibility]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [product_options_productId_sortOrder_idx] ON [dbo].[product_options]([productId], [sortOrder]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [product_variants_productId_status_idx] ON [dbo].[product_variants]([productId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [product_volume_tiers_productId_minQuantity_idx] ON [dbo].[product_volume_tiers]([productId], [minQuantity]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [product_assets_productId_kind_sortOrder_idx] ON [dbo].[product_assets]([productId], [kind], [sortOrder]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [product_assets_derivativeStatus_idx] ON [dbo].[product_assets]([derivativeStatus]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [product_account_visibility_accountId_idx] ON [dbo].[product_account_visibility]([accountId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [catalog_import_jobs_accountId_createdAt_idx] ON [dbo].[catalog_import_jobs]([accountId], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [catalog_import_jobs_status_idx] ON [dbo].[catalog_import_jobs]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [rate_cards_accountId_status_effectiveFrom_idx] ON [dbo].[rate_cards]([accountId], [status], [effectiveFrom]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [rate_cards_status_effectiveTo_idx] ON [dbo].[rate_cards]([status], [effectiveTo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [rate_card_items_productId_idx] ON [dbo].[rate_card_items]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [rate_card_tiers_rateCardItemId_minQuantity_idx] ON [dbo].[rate_card_tiers]([rateCardItemId], [minQuantity]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [carts_accountId_userId_status_idx] ON [dbo].[carts]([accountId], [userId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [carts_accountId_siteId_status_idx] ON [dbo].[carts]([accountId], [siteId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [cart_lines_cartId_idx] ON [dbo].[cart_lines]([cartId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [cart_lines_productId_idx] ON [dbo].[cart_lines]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_accountId_createdAt_idx] ON [dbo].[orders]([accountId], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_accountId_siteId_createdAt_idx] ON [dbo].[orders]([accountId], [siteId], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_accountId_status_idx] ON [dbo].[orders]([accountId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_accountId_placedById_createdAt_idx] ON [dbo].[orders]([accountId], [placedById], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_siteId_billingPeriod_status_idx] ON [dbo].[orders]([siteId], [billingPeriod], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_accountId_billingPeriod_status_idx] ON [dbo].[orders]([accountId], [billingPeriod], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [orders_status_requiresApproval_idx] ON [dbo].[orders]([status], [requiresApproval]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [order_line_items_orderId_idx] ON [dbo].[order_line_items]([orderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [order_line_items_productId_idx] ON [dbo].[order_line_items]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [order_line_items_templateVersionId_idx] ON [dbo].[order_line_items]([templateVersionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [order_status_events_orderId_createdAt_idx] ON [dbo].[order_status_events]([orderId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_rules_accountId_active_tier_idx] ON [dbo].[approval_rules]([accountId], [active], [tier]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_requests_accountId_status_currentTier_idx] ON [dbo].[approval_requests]([accountId], [status], [currentTier]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_steps_requestId_tier_idx] ON [dbo].[approval_steps]([requestId], [tier]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_steps_approverUserId_status_idx] ON [dbo].[approval_steps]([approverUserId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [invoices_accountId_billingPeriod_idx] ON [dbo].[invoices]([accountId], [billingPeriod]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [invoices_status_billingPeriod_idx] ON [dbo].[invoices]([status], [billingPeriod]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [invoice_lines_invoiceId_siteId_idx] ON [dbo].[invoice_lines]([invoiceId], [siteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [invoice_lines_orderId_idx] ON [dbo].[invoice_lines]([orderId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [templates_status_visibility_deletedAt_idx] ON [dbo].[templates]([status], [visibility], [deletedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [templates_categoryId_idx] ON [dbo].[templates]([categoryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [templates_productId_idx] ON [dbo].[templates]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [template_versions_templateId_createdAt_idx] ON [dbo].[template_versions]([templateId], [createdAt] DESC);

-- CreateIndex
CREATE NONCLUSTERED INDEX [template_assets_templateId_kind_idx] ON [dbo].[template_assets]([templateId], [kind]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [template_account_visibility_accountId_idx] ON [dbo].[template_account_visibility]([accountId]);

-- AddForeignKey
ALTER TABLE [dbo].[account_settings] ADD CONSTRAINT [account_settings_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[sites] ADD CONSTRAINT [sites_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[addresses] ADD CONSTRAINT [addresses_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[addresses] ADD CONSTRAINT [addresses_siteId_fkey] FOREIGN KEY ([siteId]) REFERENCES [dbo].[sites]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_siteId_fkey] FOREIGN KEY ([siteId]) REFERENCES [dbo].[sites]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_log_entries] ADD CONSTRAINT [audit_log_entries_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[audit_log_entries] ADD CONSTRAINT [audit_log_entries_actorId_fkey] FOREIGN KEY ([actorId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_site_access] ADD CONSTRAINT [user_site_access_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_site_access] ADD CONSTRAINT [user_site_access_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_site_access] ADD CONSTRAINT [user_site_access_siteId_fkey] FOREIGN KEY ([siteId]) REFERENCES [dbo].[sites]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_permission_grants] ADD CONSTRAINT [user_permission_grants_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_permission_grants] ADD CONSTRAINT [user_permission_grants_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[user_permission_grants] ADD CONSTRAINT [user_permission_grants_grantedById_fkey] FOREIGN KEY ([grantedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_siteId_fkey] FOREIGN KEY ([siteId]) REFERENCES [dbo].[sites]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_acceptedUserId_fkey] FOREIGN KEY ([acceptedUserId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_invitedById_fkey] FOREIGN KEY ([invitedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[password_reset_tokens] ADD CONSTRAINT [password_reset_tokens_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[refresh_tokens] ADD CONSTRAINT [refresh_tokens_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[products] ADD CONSTRAINT [products_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[product_categories]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[products] ADD CONSTRAINT [products_supersededById_fkey] FOREIGN KEY ([supersededById]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_options] ADD CONSTRAINT [product_options_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_variants] ADD CONSTRAINT [product_variants_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_volume_tiers] ADD CONSTRAINT [product_volume_tiers_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_assets] ADD CONSTRAINT [product_assets_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_account_visibility] ADD CONSTRAINT [product_account_visibility_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[product_account_visibility] ADD CONSTRAINT [product_account_visibility_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[catalog_import_jobs] ADD CONSTRAINT [catalog_import_jobs_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[catalog_import_jobs] ADD CONSTRAINT [catalog_import_jobs_requestedById_fkey] FOREIGN KEY ([requestedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[rate_cards] ADD CONSTRAINT [rate_cards_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[rate_cards] ADD CONSTRAINT [rate_cards_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[rate_card_items] ADD CONSTRAINT [rate_card_items_rateCardId_fkey] FOREIGN KEY ([rateCardId]) REFERENCES [dbo].[rate_cards]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[rate_card_items] ADD CONSTRAINT [rate_card_items_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[rate_card_tiers] ADD CONSTRAINT [rate_card_tiers_rateCardItemId_fkey] FOREIGN KEY ([rateCardItemId]) REFERENCES [dbo].[rate_card_items]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[carts] ADD CONSTRAINT [carts_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[carts] ADD CONSTRAINT [carts_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[carts] ADD CONSTRAINT [carts_siteId_fkey] FOREIGN KEY ([siteId]) REFERENCES [dbo].[sites]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[carts] ADD CONSTRAINT [carts_shippingAddressId_fkey] FOREIGN KEY ([shippingAddressId]) REFERENCES [dbo].[addresses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[carts] ADD CONSTRAINT [carts_billingAddressId_fkey] FOREIGN KEY ([billingAddressId]) REFERENCES [dbo].[addresses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[cart_lines] ADD CONSTRAINT [cart_lines_cartId_fkey] FOREIGN KEY ([cartId]) REFERENCES [dbo].[carts]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[cart_lines] ADD CONSTRAINT [cart_lines_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[cart_lines] ADD CONSTRAINT [cart_lines_variantId_fkey] FOREIGN KEY ([variantId]) REFERENCES [dbo].[product_variants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[cart_lines] ADD CONSTRAINT [cart_lines_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[templates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[cart_lines] ADD CONSTRAINT [cart_lines_templateVersionId_fkey] FOREIGN KEY ([templateVersionId]) REFERENCES [dbo].[template_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_siteId_fkey] FOREIGN KEY ([siteId]) REFERENCES [dbo].[sites]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_placedById_fkey] FOREIGN KEY ([placedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_cartId_fkey] FOREIGN KEY ([cartId]) REFERENCES [dbo].[carts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_approvedById_fkey] FOREIGN KEY ([approvedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[orders] ADD CONSTRAINT [orders_shippingAddressId_fkey] FOREIGN KEY ([shippingAddressId]) REFERENCES [dbo].[addresses]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_line_items] ADD CONSTRAINT [order_line_items_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_line_items] ADD CONSTRAINT [order_line_items_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_line_items] ADD CONSTRAINT [order_line_items_variantId_fkey] FOREIGN KEY ([variantId]) REFERENCES [dbo].[product_variants]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_line_items] ADD CONSTRAINT [order_line_items_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[templates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_line_items] ADD CONSTRAINT [order_line_items_templateVersionId_fkey] FOREIGN KEY ([templateVersionId]) REFERENCES [dbo].[template_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[order_status_events] ADD CONSTRAINT [order_status_events_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_rules] ADD CONSTRAINT [approval_rules_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_rules] ADD CONSTRAINT [approval_rules_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[product_categories]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_rules] ADD CONSTRAINT [approval_rules_siteId_fkey] FOREIGN KEY ([siteId]) REFERENCES [dbo].[sites]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_rules] ADD CONSTRAINT [approval_rules_approverUserId_fkey] FOREIGN KEY ([approverUserId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_requests] ADD CONSTRAINT [approval_requests_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_requests] ADD CONSTRAINT [approval_requests_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[approval_requests]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_ruleId_fkey] FOREIGN KEY ([ruleId]) REFERENCES [dbo].[approval_rules]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_approverUserId_fkey] FOREIGN KEY ([approverUserId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[approval_steps] ADD CONSTRAINT [approval_steps_decidedById_fkey] FOREIGN KEY ([decidedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invoices] ADD CONSTRAINT [invoices_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invoice_lines] ADD CONSTRAINT [invoice_lines_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[invoices]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[invoice_lines] ADD CONSTRAINT [invoice_lines_orderId_fkey] FOREIGN KEY ([orderId]) REFERENCES [dbo].[orders]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[templates] ADD CONSTRAINT [templates_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[products]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[templates] ADD CONSTRAINT [templates_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[product_categories]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[templates] ADD CONSTRAINT [templates_thumbnailAssetId_fkey] FOREIGN KEY ([thumbnailAssetId]) REFERENCES [dbo].[template_assets]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[templates] ADD CONSTRAINT [templates_previewAssetId_fkey] FOREIGN KEY ([previewAssetId]) REFERENCES [dbo].[template_assets]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[templates] ADD CONSTRAINT [templates_publishedVersionId_fkey] FOREIGN KEY ([publishedVersionId]) REFERENCES [dbo].[template_versions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[templates] ADD CONSTRAINT [templates_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[templates] ADD CONSTRAINT [templates_updatedById_fkey] FOREIGN KEY ([updatedById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[template_versions] ADD CONSTRAINT [template_versions_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[templates]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[template_versions] ADD CONSTRAINT [template_versions_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[template_assets] ADD CONSTRAINT [template_assets_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[templates]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[template_account_visibility] ADD CONSTRAINT [template_account_visibility_templateId_fkey] FOREIGN KEY ([templateId]) REFERENCES [dbo].[templates]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[template_account_visibility] ADD CONSTRAINT [template_account_visibility_accountId_fkey] FOREIGN KEY ([accountId]) REFERENCES [dbo].[accounts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
