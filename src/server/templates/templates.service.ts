import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { Template, TemplateVersion } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import { enqueueDerivatives } from '../catalog/asset-derivative.service'
import {
  changesBetween,
  created,
  fieldChange,
  mergeChanges,
  removed,
} from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { can as hasPermission } from '../auth/permission.service'
import { Permission } from '../auth/permissions'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma } from '../db/client'
import {
  forgetDamFileAsActor,
  forgetOperatorDamFile,
  readDamFileAsActor,
  readOperatorDamFile,
} from '../dam/dam.service'
import {
  buildKey,
  presignDownload,
  put,
  StoragePrefix,
} from '../storage/storage.service'
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  StaleVersionError,
} from '../utils/errors'
import { createId } from '../utils/ids'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import { asEnum } from '../db/column-types'
import { fromJson, fromJsonOr, toJson, toJsonOrNull } from '../db/json-column'
import {
  assertCanManage,
  assertCanPublish,
  isCustomerOwned,
  ownershipForCreator,
  visibilityFilter,
} from './template-ownership'
import {
  readLayers,
  readSnapshot,
  type CustomisableTemplateSource,
  type FullTemplateSource,
  type TemplateSnapshot,
  type TemplateSummarySource,
} from './template.types'
import {
  acceptCustomisation,
  assertLayersWellFormed,
  assertPublishable,
  assertTransition,
  normaliseTemplateCode,
  type TemplateStatus,
} from './template-status'
import type {
  AttachTemplateAssetDto,
  ChangeTemplateStatusDto,
  CreateTemplateDto,
  CustomiseTemplateDto,
  ListTemplatesQueryDto,
  PublishTemplateDto,
  RestoreVersionDto,
  SetTemplateVisibilityDto,
  SnapshotTemplateDto,
  UpdateTemplateDto,
} from './template.validation'

/**
 * The product and category are joined into every read, summary included.
 *
 * A gallery shows "Target product: A2 Gloss Poster", not an id, and the
 * alternative is the client fetching a product per tile — forty round trips to
 * render one screen. Two indexed joins on a page of twenty-five rows cost
 * nothing next to that.
 */
const NAMED_REFERENCES = Prisma.validator<Prisma.TemplateInclude>()({
  product: { select: { id: true, sku: true, name: true } },
  category: { select: { id: true, code: true, name: true } },
  publishedVersion: { select: { version: true } },
})

const FULL_TEMPLATE = Prisma.validator<Prisma.TemplateInclude>()({
  ...NAMED_REFERENCES,
  assets: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
  versions: { orderBy: { version: 'desc' }, take: 50 },
  visibleTo: { select: { accountId: true } },
})

const SUMMARY_TEMPLATE = NAMED_REFERENCES

/**
 * Master artwork templates.
 *
 * ---------------------------------------------------------------------------
 * The one idea the rest of this file follows from
 * ---------------------------------------------------------------------------
 * A `Template` row is a **draft**. It is what the builder opens, what autosave
 * writes to, and what `version` counts. What a *buyer* personalises is a
 * `TemplateVersion` — an immutable snapshot taken at publish time.
 *
 * So a designer reworking a live template cannot change the artwork somebody is
 * halfway through ordering, and "publish" is the single deliberate act that
 * moves customers onto new work. Every read below is therefore one of two
 * kinds, and they never share a code path:
 *
 * - **Operator reads** (`listTemplates`, `findTemplateById`) return the working
 *   copy.
 * - **Buyer reads** (`getCustomisable`) return the published snapshot.
 *
 * ---------------------------------------------------------------------------
 * Global, like the catalogue
 * ---------------------------------------------------------------------------
 * Templates are the platform operator's: `TEMPLATE_MANAGE` is in no customer
 * role. There is no `accountId` and no row-level security here. What bounds a
 * customer read is `visibilityFilter()` — one function, for the same reason the
 * catalogue has one: a predicate copied into each query is a predicate that
 * eventually differs in one of them.
 */

// --- Reads ------------------------------------------------------------------

export async function listTemplates(
  actor: AuthenticatedActor,
  query: ListTemplatesQueryDto
): Promise<OffsetPage<TemplateSummarySource>> {
  // Composed as an AND array rather than one spread object: the visibility
  // filter and the search filter each contribute a top-level `OR`, and
  // spreading them into one object would silently keep only the last.
  const clauses: Prisma.TemplateWhereInput[] = [
    { deletedAt: null },
    visibilityFilter(actor),
  ]

  if (query.categoryId) clauses.push({ categoryId: query.categoryId })
  if (query.productId) clauses.push({ productId: query.productId })
  if (query.theme) clauses.push({ theme: query.theme })
  // A customer asking for DRAFT gets nothing rather than an error: the
  // visibility filter already pinned them to PUBLISHED, and the intersection is
  // empty. That is the filter doing its job, not a fault to report.
  if (query.status) clauses.push({ status: query.status })
  if (query.search) {
    clauses.push({
      OR: [
        { name: { contains: query.search } },
        { code: { contains: query.search } },
        { description: { contains: query.search } },
      ],
    })
  }

  const where: Prisma.TemplateWhereInput = { AND: clauses }
  const { skip, take } = toSkipTake(query)

  const [items, total] = await Promise.all([
    prisma.template.findMany({
      where,
      include: SUMMARY_TEMPLATE,
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take,
    }),
    prisma.template.count({ where }),
  ])

  return offsetPage(items, total, query)
}

/** The working copy, for the builder. Bounded by the same visibility filter. */
export async function findTemplateById(
  actor: AuthenticatedActor,
  templateId: string
): Promise<FullTemplateSource> {
  const template = await prisma.template.findFirst({
    where: {
      AND: [{ id: templateId, deletedAt: null }, visibilityFilter(actor)],
    },
    include: FULL_TEMPLATE,
  })

  if (!template)
    throw new NotFoundError('Template not found.', { details: { templateId } })
  return template
}

/**
 * What a buyer personalises: the published snapshot.
 *
 * Deliberately not `findTemplateById` with a status check. A template whose
 * draft has moved on since publication must still hand the buyer the artwork
 * that was published, and reading the row would hand them the designer's work
 * in progress.
 */
export async function getCustomisable(
  actor: AuthenticatedActor,
  templateId: string
): Promise<{ template: CustomisableTemplateSource; version: TemplateVersion }> {
  const template = await prisma.template.findFirst({
    where: {
      AND: [
        { id: templateId, deletedAt: null, status: 'PUBLISHED' },
        visibilityFilter(actor),
      ],
    },
    // The product and category come from the live row rather than the snapshot:
    // a product renamed since publication should read by its current name on
    // the customiser, because that is what the buyer will see everywhere else
    // in the shop. The *artwork* is the snapshot's, and that is the part that
    // must not move.
    include: {
      publishedVersion: true,
      product: { select: { id: true, sku: true, name: true } },
      category: { select: { id: true, code: true, name: true } },
    },
  })

  if (!template?.publishedVersion) {
    // One message for "no such template" and "not published to you". Telling
    // them apart would let a customer enumerate the library by watching which
    // ids answer differently.
    throw new NotFoundError('That template is not available.', {
      details: { templateId },
    })
  }

  return { template, version: template.publishedVersion }
}

/**
 * Cuts a restore point from the current draft, without publishing it.
 *
 * Reuses the version number the draft is already on rather than allocating a
 * new one, which is what makes "restore version 7" mean the same thing whether
 * version 7 was published or merely kept. Snapshotting twice at the same
 * version is therefore a no-op rather than an error.
 */
export async function snapshotTemplate(
  templateId: string,
  dto: SnapshotTemplateDto,
  actor: AuthenticatedActor
): Promise<readonly TemplateVersion[]> {
  const template = await requireManageable(templateId, actor)

  const existing = await prisma.templateVersion.findUnique({
    where: { templateId_version: { templateId, version: template.version } },
  })

  if (!existing) {
    await prisma.templateVersion.create({
      data: {
        id: createId('tpv'),
        templateId,
        version: template.version,
        snapshot: toJson(buildSnapshot(template)),
        label: dto.label ?? 'Saved',
        createdById: actor.userId,
        createdByName: actor.email,
      },
    })
  }

  return prisma.templateVersion.findMany({
    where: { templateId },
    orderBy: { version: 'desc' },
  })
}

export async function listVersions(
  templateId: string,
  actor: AuthenticatedActor
): Promise<readonly TemplateVersion[]> {
  await requireManageable(templateId, actor)

  return prisma.templateVersion.findMany({
    where: { templateId },
    orderBy: { version: 'desc' },
  })
}

// --- Writes -----------------------------------------------------------------

/**
 * A new design, from nothing.
 *
 * Administrators only, and the reason is pricing rather than authorship. A
 * design has to carry a price before anyone can order it, and PRICING_MANAGE is
 * held by no customer role — so a head office or site user building from a
 * blank canvas would produce a design nobody could ever buy, including them.
 * Customers get their designs the two ways that guarantee a price: a copy of
 * one of ours, or the copy granted automatically when they order one.
 */
export async function createTemplate(
  dto: CreateTemplateDto,
  actor: AuthenticatedActor
): Promise<FullTemplateSource> {
  if (actor.role !== Role.ADMIN) {
    throw new BusinessRuleError(
      'New designs are built by the print team. Start from one in the library — ' +
        'open it, copy it, and the copy is yours to edit as much as you like.',
      { details: { reason: 'SCRATCH_CREATE_IS_ADMIN_ONLY' } }
    )
  }

  const code = normaliseTemplateCode(dto.code ?? (await deriveCode(dto.name)))
  assertLayersWellFormed(dto.layers)
  await assertReferencesExist(dto.productId, dto.categoryId)

  const pricing = await pricingFields(dto, actor)
  const id = createId('tpl')

  try {
    await prisma.template.create({
      data: {
        id,
        code,
        name: dto.name,
        description: dto.description ?? null,
        productId: dto.productId ?? null,
        categoryId: dto.categoryId ?? null,
        theme: dto.theme ?? null,
        orientation: dto.orientation,
        aspectRatio: dto.aspectRatio ?? null,
        widthValue: new Prisma.Decimal(dto.widthValue),
        heightValue: new Prisma.Decimal(dto.heightValue),
        dimensionUnit: dto.dimensionUnit,
        bleedMargin: new Prisma.Decimal(dto.bleedMargin),
        safeMargin: new Prisma.Decimal(dto.safeMargin),
        canvasConfig: toJson(dto.canvasConfig),
        layers: toJson(dto.layers),
        design: toJsonOrNull(dto.design),
        canvasJson: dto.canvasJson ?? null,
        ...pricing,
        // Not the caller's choice. An administrator builds the operator's
        // library, a head office builds for its branches, a site user builds
        // for itself — see ownershipForCreator.
        ...ownershipForCreator(actor),
        createdById: actor.userId,
        createdByName: actor.email,
        updatedById: actor.userId,
        updatedByName: actor.email,
      },
    })
  } catch (error) {
    throw await translateDuplicateCode(error, code)
  }

  await recordAudit({
    action: AuditAction.TEMPLATE_CREATED,
    entityType: 'TEMPLATE',
    entityId: id,
    entityName: `${code} — ${dto.name}`,
    accountId: actor.accountId,
    changes: created(
      templateForAudit(await readTemplateForAudit(id)),
      TEMPLATE_AUDIT_FIELDS
    ),
  })

  return findTemplateById(actor, id)
}

/**
 * A save from the builder, including an autosave.
 *
 * ---------------------------------------------------------------------------
 * Why the version check is a conditional UPDATE and not a read-then-write
 * ---------------------------------------------------------------------------
 * Reading the row, comparing versions and then writing leaves a window between
 * the read and the write in which the other designer's save lands — which is
 * precisely the collision this is meant to catch, arriving too quickly to be
 * seen. The comparison happens *inside* the write, so the database decides, and
 * a zero-row result is the collision.
 */
export async function updateTemplate(
  templateId: string,
  dto: UpdateTemplateDto,
  actor: AuthenticatedActor
): Promise<FullTemplateSource> {
  const existing = await requireManageable(templateId, actor)
  const before = await readTemplateForAudit(templateId)

  if (dto.layers) assertLayersWellFormed(dto.layers)
  await assertReferencesExist(dto.productId, dto.categoryId)

  const code =
    dto.code === undefined ? undefined : normaliseTemplateCode(dto.code)

  // `TemplateUncheckedUpdateManyInput`, not the checked `UpdateInput`: this is
  // an `updateMany` — that is what makes the version comparison happen inside
  // the write — and a conditional update addresses rows, not one row, so
  // foreign keys go in as scalars rather than as relation connects.
  const data: Prisma.TemplateUncheckedUpdateManyInput = {
    ...(code !== undefined ? { code } : {}),
    ...(dto.name !== undefined ? { name: dto.name } : {}),
    ...(dto.description !== undefined ? { description: dto.description } : {}),
    ...(dto.productId !== undefined ? { productId: dto.productId } : {}),
    ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
    // Dropped silently for anyone without PRICING_MANAGE — see pricingFields.
    ...(await pricingFields(dto, actor)),
    ...(dto.theme !== undefined ? { theme: dto.theme } : {}),
    ...(dto.orientation !== undefined ? { orientation: dto.orientation } : {}),
    ...(dto.aspectRatio !== undefined ? { aspectRatio: dto.aspectRatio } : {}),
    ...(dto.widthValue !== undefined
      ? { widthValue: new Prisma.Decimal(dto.widthValue) }
      : {}),
    ...(dto.heightValue !== undefined
      ? { heightValue: new Prisma.Decimal(dto.heightValue) }
      : {}),
    ...(dto.dimensionUnit !== undefined
      ? { dimensionUnit: dto.dimensionUnit }
      : {}),
    ...(dto.bleedMargin !== undefined
      ? { bleedMargin: new Prisma.Decimal(dto.bleedMargin) }
      : {}),
    ...(dto.safeMargin !== undefined
      ? { safeMargin: new Prisma.Decimal(dto.safeMargin) }
      : {}),
    ...(dto.canvasConfig !== undefined
      ? { canvasConfig: toJson(dto.canvasConfig) }
      : {}),
    ...(dto.layers !== undefined ? { layers: toJson(dto.layers) } : {}),
    ...(dto.design !== undefined ? { design: toJsonOrNull(dto.design) } : {}),
    ...(dto.canvasJson !== undefined ? { canvasJson: dto.canvasJson } : {}),
    version: { increment: 1 },
    updatedById: actor.userId,
    updatedByName: actor.email,
  }

  let updated: Prisma.BatchPayload
  try {
    updated = await prisma.template.updateMany({
      where: {
        id: templateId,
        deletedAt: null,
        // Omitted means "I do not care what happened since I loaded this",
        // which is a real choice a recovery tool makes. The builder always
        // sends it.
        ...(dto.expectedVersion !== undefined
          ? { version: dto.expectedVersion }
          : {}),
      },
      data,
    })
  } catch (error) {
    throw await translateDuplicateCode(error, code ?? existing.code)
  }

  if (updated.count === 0) {
    throw new StaleVersionError(
      'This template changed while you were editing it. Reload before saving again.',
      {
        details: {
          templateId,
          expectedVersion: dto.expectedVersion,
          actual: existing.version,
        },
      }
    )
  }

  await recordAudit({
    action: AuditAction.TEMPLATE_UPDATED,
    entityType: 'TEMPLATE',
    entityId: templateId,
    entityName: `${existing.code} — ${existing.name}`,
    accountId: actor.accountId,
    // The artwork is recorded by fingerprint, not copied — see
    // `templateForAudit`: it is the whole design, it changes on every autosave,
    // and a log carrying a copy of every keystroke's document would dwarf the
    // tables it records. The fingerprint still says *that* it changed.
    changes: changesBetween(
      templateForAudit(before),
      templateForAudit(await readTemplateForAudit(templateId)),
      TEMPLATE_AUDIT_FIELDS
    ),
  })

  return findTemplateById(actor, templateId)
}

/**
 * Publishes: freezes the current draft as a version and points the storefront
 * at it.
 *
 * Republishing an already-published template is the same operation — it cuts a
 * new version and moves the pointer. That is why publishing is its own endpoint
 * rather than a status change: `PUBLISHED → PUBLISHED` is not a transition, but
 * it is a thing a designer does every week.
 */
export async function publishTemplate(
  templateId: string,
  dto: PublishTemplateDto,
  actor: AuthenticatedActor
): Promise<FullTemplateSource> {
  const existing = await requireManageable(templateId, actor)
  const before = await readTemplateForAudit(templateId)

  // Managing your own template is not the same as publishing it. A site user
  // may build and edit endlessly in private; making a design that everyone in
  // the branch will print is a head office decision.
  assertCanPublish(actor, existing)

  // Read once for both checks below. A product's pack size does not move during
  // a publish, and re-reading it inside the transaction would buy nothing.
  // Null for print-on-demand, which holds no stock and so has no pack size to
  // disagree with — see assertPublishable.
  const productPackSize = await stockedPackSizeOf(existing.productId)

  assertPublishable({
    name: existing.name,
    layers: readLayers(existing.layers),
    price: existing.price?.toNumber() ?? null,
    unitsPerPack: existing.unitsPerPack,
    productPackSize,
  })

  await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction. Between the checks above and this write
    // another save may have landed, and the snapshot has to be of what is
    // actually there — publishing a version numbered for one document and
    // holding another is the one corruption this table cannot recover from.
    const current = await tx.template.findUniqueOrThrow({
      where: { id: templateId },
    })
    assertPublishable({
      name: current.name,
      layers: readLayers(current.layers),
      price: current.price?.toNumber() ?? null,
      unitsPerPack: current.unitsPerPack,
      productPackSize,
    })

    // Reuse the restore point if the draft has already been snapshotted at this
    // version, rather than trying to create a second one and colliding on
    // (templateId, version). snapshotTemplate() has always guarded this way and
    // says so -- "snapshotting twice at the same version is a no-op rather than
    // an error" -- but publish did not, so an explicit save followed by a
    // publish failed on the unique index. Predates the SQL Server move; the same
    // index would have refused it under PostgreSQL.
    const existing = await tx.templateVersion.findUnique({
      where: { templateId_version: { templateId, version: current.version } },
    })

    const version =
      existing ??
      (await tx.templateVersion.create({
        data: {
          id: createId('tpv'),
          templateId,
          version: current.version,
          snapshot: toJson(buildSnapshot(current)),
          price: current.price,
          unitsPerPack: current.unitsPerPack,
          label: dto.label ?? 'Published',
          createdById: actor.userId,
          createdByName: actor.email,
        },
      }))

    // A restore point taken by `snapshotTemplate` carries no price — it is a
    // "before I broke it" marker, not a published version, and nothing prices
    // against it. Publishing that same version turns it into the thing baskets
    // quote from, so the price has to be stamped on now. Without this, a save
    // followed by a publish would publish at no price and every line built from
    // it would silently fall back to the catalogue.
    if (existing && existing.price === null && current.price !== null) {
      await tx.templateVersion.update({
        where: { id: existing.id },
        data: {
          price: current.price,
          unitsPerPack: current.unitsPerPack,
          snapshot: toJson(buildSnapshot(current)),
        },
      })
    }

    await tx.template.update({
      where: { id: templateId },
      data: {
        status: 'PUBLISHED',
        publishedVersionId: version.id,
        publishedAt: new Date(),
        updatedById: actor.userId,
        updatedByName: actor.email,
      },
    })
  })

  await recordAudit({
    action: AuditAction.TEMPLATE_PUBLISHED,
    entityType: 'TEMPLATE',
    entityId: templateId,
    entityName: `${existing.code} — ${existing.name}`,
    accountId: actor.accountId,
    changes: changesBetween(
      templateForAudit(before),
      templateForAudit(await readTemplateForAudit(templateId)),
      ['status', 'publishedVersionId', 'publishedAt', 'price', 'unitsPerPack']
    ),
    details: { version: existing.version, label: dto.label ?? 'Published' },
  })

  return findTemplateById(actor, templateId)
}

/**
 * Moves between DRAFT, PUBLISHED and ARCHIVED.
 *
 * Publishing is *not* reachable here: it has to cut a version, and a status
 * change that silently did that would hide the one act with a lasting
 * consequence behind the one without.
 */
export async function changeTemplateStatus(
  templateId: string,
  dto: ChangeTemplateStatusDto,
  actor: AuthenticatedActor
): Promise<FullTemplateSource> {
  const existing = await requireManageable(templateId, actor)

  if (dto.status === 'PUBLISHED') {
    throw new BusinessRuleError(
      'Use POST /templates/:id/publish to publish. Publishing freezes a version, ' +
        'which a status change would hide.'
    )
  }

  assertTransition(asEnum<TemplateStatus>(existing.status), dto.status)

  const before = await readTemplateForAudit(templateId)
  await prisma.template.update({
    where: { id: templateId },
    data: {
      status: dto.status,
      // The published pointer is deliberately kept when archiving or
      // unpublishing: an order personalised from a version must still resolve
      // it, and clearing the pointer would strand exactly the customers who
      // already committed.
      updatedById: actor.userId,
      updatedByName: actor.email,
    },
  })

  await recordAudit({
    action: AuditAction.TEMPLATE_STATUS_CHANGED,
    entityType: 'TEMPLATE',
    entityId: templateId,
    entityName: `${existing.code} — ${existing.name}`,
    accountId: actor.accountId,
    changes: changesBetween(before, await readTemplateForAudit(templateId), [
      'status',
    ]),
  })

  return findTemplateById(actor, templateId)
}

/**
 * Copies an old version back over the draft.
 *
 * Never deletes the versions in between — the point of a history is that it
 * does not lose the thing you restored *from*. The restore is itself a save, so
 * it bumps `version` and can be undone by restoring the version it replaced.
 */
export async function restoreVersion(
  templateId: string,
  dto: RestoreVersionDto,
  actor: AuthenticatedActor
): Promise<FullTemplateSource> {
  const existing = await requireManageable(templateId, actor)

  const version = await prisma.templateVersion.findUnique({
    where: { templateId_version: { templateId, version: dto.version } },
  })

  if (!version) {
    throw new NotFoundError(`This template has no version ${dto.version}.`, {
      details: { templateId, version: dto.version },
    })
  }

  const snapshot = readSnapshot(version.snapshot)
  const before = await readTemplateForAudit(templateId)

  await prisma.template.update({
    where: { id: templateId },
    data: {
      name: snapshot.name,
      description: snapshot.description,
      theme: snapshot.theme,
      orientation: snapshot.orientation,
      aspectRatio: snapshot.aspectRatio,
      widthValue: new Prisma.Decimal(snapshot.widthValue),
      heightValue: new Prisma.Decimal(snapshot.heightValue),
      dimensionUnit: snapshot.dimensionUnit,
      bleedMargin: new Prisma.Decimal(snapshot.bleedMargin),
      safeMargin: new Prisma.Decimal(snapshot.safeMargin),
      canvasConfig: toJson(snapshot.canvasConfig),
      layers: toJson(snapshot.layers),
      design: toJsonOrNull(snapshot.design),
      canvasJson: snapshot.canvasJson,
      // Restored with the artwork: "put it back how it was" has to include what
      // it cost, or rolling back a design would quietly reprice it. A snapshot
      // taken before designs carried prices restores null, which is honest —
      // that version had no price — and publish will ask for one.
      price:
        snapshot.price === null ? null : new Prisma.Decimal(snapshot.price),
      unitsPerPack: snapshot.unitsPerPack,
      version: { increment: 1 },
      updatedById: actor.userId,
      updatedByName: actor.email,
    },
  })

  await recordAudit({
    action: AuditAction.TEMPLATE_VERSION_RESTORED,
    entityType: 'TEMPLATE',
    entityId: templateId,
    entityName: `${existing.code} — ${existing.name}`,
    accountId: actor.accountId,
    changes: changesBetween(
      templateForAudit(before),
      templateForAudit(await readTemplateForAudit(templateId)),
      TEMPLATE_AUDIT_FIELDS
    ),
    details: { restoredVersion: dto.version },
  })

  return findTemplateById(actor, templateId)
}

/**
 * Soft delete.
 *
 * The row survives because published versions of it may be referenced by
 * orders. What stops is every read: `deletedAt: null` is in the filter of each
 * one, so a deleted template disappears from the gallery and from the
 * customiser immediately.
 */
export async function removeTemplate(
  templateId: string,
  actor: AuthenticatedActor
): Promise<void> {
  const existing = await requireManageable(templateId, actor)

  const before = await readTemplateForAudit(templateId)
  await prisma.template.update({
    where: { id: templateId },
    data: { deletedAt: new Date(), status: 'ARCHIVED' },
  })

  await recordAudit({
    action: AuditAction.TEMPLATE_DELETED,
    entityType: 'TEMPLATE',
    entityId: templateId,
    entityName: `${existing.code} — ${existing.name}`,
    accountId: actor.accountId,
    changes: removed(templateForAudit(before), TEMPLATE_AUDIT_FIELDS),
  })
}

export async function setTemplateVisibility(
  templateId: string,
  dto: SetTemplateVisibilityDto,
  actor: AuthenticatedActor
): Promise<FullTemplateSource> {
  const existing = await requireManageable(templateId, actor)

  if (dto.visibility === 'RESTRICTED') {
    const found = await prisma.account.count({
      where: { id: { in: dto.accountIds }, deletedAt: null },
    })
    if (found !== new Set(dto.accountIds).size) {
      throw new BusinessRuleError(
        'One or more of those accounts does not exist. Nothing was changed.'
      )
    }
  }

  const before = await readTemplateForAudit(templateId)
  const beforeAccountIds = await templateAllowList(templateId)

  await prisma.$transaction(async (tx) => {
    await tx.template.update({
      where: { id: templateId },
      data: { visibility: dto.visibility },
    })

    // Replaced wholesale rather than diffed. The list is short, the operation
    // is rare, and a diff is a place for a stale grant to survive.
    await tx.templateAccountVisibility.deleteMany({ where: { templateId } })

    if (dto.visibility === 'RESTRICTED') {
      await tx.templateAccountVisibility.createMany({
        data: [...new Set(dto.accountIds)].map((accountId) => ({
          id: createId('tav'),
          templateId,
          accountId,
        })),
      })
    }
  })

  await recordAudit({
    action: AuditAction.TEMPLATE_VISIBILITY_SET,
    entityType: 'TEMPLATE',
    entityId: templateId,
    entityName: `${existing.code} — ${existing.name}`,
    accountId: actor.accountId,
    changes: mergeChanges(
      changesBetween(before, await readTemplateForAudit(templateId), [
        'visibility',
      ]),
      fieldChange(
        'accountIds',
        beforeAccountIds,
        await templateAllowList(templateId)
      )
    ),
  })

  return findTemplateById(actor, templateId)
}

// --- Assets -----------------------------------------------------------------

/**
 * Attaches a document-library file to a template.
 *
 * ---------------------------------------------------------------------------
 * Why the bytes are copied rather than linked
 * ---------------------------------------------------------------------------
 * The library is where artwork is kept and curated; object storage is how the
 * portal serves it. Linking straight to a library URL fails on all three counts
 * that matter here: a buyer browsing the storefront has no Ticket-IT session to
 * resolve one with, the links the library hands out may be signed and
 * time-limited — a stored one would be a 403 by the time anyone opened the row —
 * and the derivative worker has to read the source to make a thumbnail.
 *
 * So the file is pulled once and written to the same key any upload would have
 * used. Everything downstream — presigned reads, derivatives, the copy granted
 * when a design is ordered — carries on unchanged, and `damDocumentId` records
 * where it came from.
 *
 * ---------------------------------------------------------------------------
 * Whose library it is pulled from
 * ---------------------------------------------------------------------------
 * Decided by `isCustomerOwned`, and this is the part to be careful with.
 * Templates are *not* all the operator's: `canManage` lets any user edit a
 * template they own. A customer's file is in the customer's library and must be
 * read with the customer's own token — with the operator's, the portal would
 * either fail to find it or copy the operator's file of that name into the
 * customer's template.
 *
 * Two things this closes that the presign flow could not:
 *
 * 1. The key is built here, from the template's own code, so there is no
 *    caller-supplied key to check for belonging to another template.
 * 2. `sizeBytes` and `contentType` are read off the file rather than taken on
 *    trust, so a row can no longer disagree with the object it describes.
 *
 * A THUMBNAIL or PREVIEW still replaces the previous one rather than joining it,
 * and the library file behind the replaced one is unlinked so repeated edits do
 * not leave superseded files behind.
 */
export async function attachTemplateAsset(
  templateId: string,
  dto: AttachTemplateAssetDto,
  actor: AuthenticatedActor
): Promise<FullTemplateSource> {
  const template = await requireManageable(templateId, actor)

  // Whose library the file is in follows from who owns the template. A customer
  // building their own design uploaded it into *their* Ticket-IT library, and
  // the operator's credential would either not find it or — worse — find the
  // operator's file of that name and copy it into their template.
  const asCustomer = isCustomerOwned(template)
  const source = asCustomer
    ? await readDamFileAsActor(actor, dto)
    : await readOperatorDamFile(dto)

  const storageKey = buildKey(
    StoragePrefix.ARTWORK,
    `template/${template.code}`,
    `${Date.now()}-${source.fileName}`
  )

  await put(storageKey, source.bytes, {
    contentType: source.contentType,
    downloadFilename: source.fileName,
  })

  const assetId = createId('tpa')

  const previousSingleton =
    dto.kind === 'THUMBNAIL'
      ? template.thumbnailAssetId
      : dto.kind === 'PREVIEW'
        ? template.previewAssetId
        : null

  // Read before the row is deleted below: afterwards there is nothing left to
  // say which library file the old thumbnail came from.
  const replaced = previousSingleton
    ? await prisma.templateAsset.findUnique({
        where: { id: previousSingleton },
        select: { damDocumentId: true, contentType: true },
      })
    : null

  await prisma.$transaction(async (tx) => {
    await tx.templateAsset.create({
      data: {
        id: assetId,
        templateId,
        kind: dto.kind,
        storageKey,
        filename: source.fileName,
        contentType: source.contentType,
        sizeBytes: source.sizeBytes,
        altText: dto.altText ?? null,
        sortOrder: dto.sortOrder,
        damDocumentId: dto.damDocumentId,
        // PENDING is what the render worker looks for. It stays PENDING until
        // the worker writes the derivatives, and reads serve the original in
        // the meantime — see the fallback in presignTemplateThumbnails.
        derivativeStatus: source.contentType.startsWith('image/')
          ? 'PENDING'
          : 'NOT_APPLICABLE',
      },
    })

    if (dto.kind === 'THUMBNAIL') {
      await tx.template.update({
        where: { id: templateId },
        data: { thumbnailAssetId: assetId },
      })
    } else if (dto.kind === 'PREVIEW') {
      await tx.template.update({
        where: { id: templateId },
        data: { previewAssetId: assetId },
      })
    }

    // The pointer moved first, so this delete cannot orphan a live reference.
    if (previousSingleton) {
      await tx.templateAsset.delete({ where: { id: previousSingleton } })
    }
  })

  // Outside the transaction, so a queue that is slow or unreachable cannot roll
  // back an attachment that has already succeeded. Enqueueing inside would also
  // race the commit: the worker could read the asset before it was visible.
  if (source.contentType.startsWith('image/')) {
    await enqueueDerivatives(assetId, 'TEMPLATE')
  }

  // Replacing a thumbnail takes the old one out of the library too, so repeated
  // edits do not leave a trail of superseded files behind. Never throws — the
  // replacement has already happened and is what the user asked for.
  if (replaced?.damDocumentId) {
    await (asCustomer
      ? forgetDamFileAsActor(
          actor,
          replaced.damDocumentId,
          replaced.contentType
        )
      : forgetOperatorDamFile(replaced.damDocumentId, replaced.contentType))
  }

  await recordAudit({
    action: AuditAction.TEMPLATE_ASSET_ATTACHED,
    entityType: 'TEMPLATE',
    entityId: templateId,
    entityName: `${template.code} — ${template.name}`,
    accountId: actor.accountId,
    changes: mergeChanges(
      created(
        await prisma.templateAsset.findUniqueOrThrow({
          where: { id: assetId },
        }),
        TEMPLATE_ASSET_AUDIT_FIELDS
      ),
      // A thumbnail or preview moves the template's pointer too.
      changesBetween(template, await readTemplateForAudit(templateId), [
        'thumbnailAssetId',
        'previewAssetId',
      ])
    ),
    details: { assetId, replaced: previousSingleton },
  })

  return findTemplateById(actor, templateId)
}

export async function removeTemplateAsset(
  templateId: string,
  assetId: string,
  actor: AuthenticatedActor
): Promise<void> {
  const template = await requireManageable(templateId, actor)

  const asset = await prisma.templateAsset.findFirst({
    where: { id: assetId, templateId },
  })
  if (!asset) {
    throw new NotFoundError('Asset not found on this template.', {
      details: { templateId, assetId },
    })
  }

  // The pointer is cleared first: deleting a row a template still points at
  // would fail the foreign key, and clearing it afterwards would leave a window
  // where the template references a deleted asset.
  await prisma.$transaction(async (tx) => {
    if (template.thumbnailAssetId === assetId) {
      await tx.template.update({
        where: { id: templateId },
        data: { thumbnailAssetId: null },
      })
    }
    if (template.previewAssetId === assetId) {
      await tx.template.update({
        where: { id: templateId },
        data: { previewAssetId: null },
      })
    }
    await tx.templateAsset.delete({ where: { id: assetId } })
  })

  // The S3 object is left in storage. Removing it would delete a file a
  // published version's design may still reference, and storage is cheap next to
  // a template that renders with a hole in it; sweeping genuinely unreferenced
  // objects belongs on a maintenance job.
  //
  // The *library* file is removed, because the library is a curated place rather
  // than a cache and an operator who detaches an image expects it gone. Note the
  // asymmetry is deliberate, and note what it costs: the library has no notion of
  // what references a file, so this deletes it even if someone is using it on
  // another template.
  if (asset.damDocumentId) {
    await (isCustomerOwned(template)
      ? forgetDamFileAsActor(actor, asset.damDocumentId, asset.contentType)
      : forgetOperatorDamFile(asset.damDocumentId, asset.contentType))
  }

  await recordAudit({
    action: AuditAction.TEMPLATE_ASSET_REMOVED,
    entityType: 'TEMPLATE',
    entityId: templateId,
    entityName: `${template.code} — ${template.name}`,
    accountId: actor.accountId,
    changes: mergeChanges(
      removed(asset, TEMPLATE_ASSET_AUDIT_FIELDS),
      changesBetween(template, await readTemplateForAudit(templateId), [
        'thumbnailAssetId',
        'previewAssetId',
      ])
    ),
    details: { assetId },
  })
}

// --- Personalisation --------------------------------------------------------

/**
 * Validates a buyer's personalisation against the template they are ordering
 * from, and returns only the values that template accepts.
 *
 * Checked against the **published version**, never the draft: the buyer is
 * looking at the published artwork, and validating against a draft the designer
 * has since changed would reject fields that are on their screen.
 */
export async function customiseTemplate(
  actor: AuthenticatedActor,
  templateId: string,
  dto: CustomiseTemplateDto
): Promise<{
  templateId: string
  versionId: string
  version: number
  fields: Record<string, string>
}> {
  const { version } = await getCustomisable(actor, templateId)
  const snapshot = readSnapshot(version.snapshot)

  const fields = acceptCustomisation(
    snapshot.layers as unknown as Parameters<typeof acceptCustomisation>[0],
    dto.fields
  )

  return { templateId, versionId: version.id, version: version.version, fields }
}

// --- Presigning -------------------------------------------------------------

/**
 * One signed tile per template, for a gallery.
 *
 * Falls back to the original when no derivative exists yet: a freshly uploaded
 * image whose resize is still queued should show the full-size file rather than
 * a broken tile.
 */
export async function presignTemplateThumbnails(
  templates: readonly TemplateSummarySource[]
): Promise<Record<string, string>> {
  const withThumbnails = templates.filter(
    (template) => template.thumbnailAssetId !== null
  )
  if (withThumbnails.length === 0) return {}

  const assets = await prisma.templateAsset.findMany({
    where: {
      id: { in: withThumbnails.map((template) => template.thumbnailAssetId!) },
    },
    select: { id: true, storageKey: true, thumbnailKey: true },
  })
  const byId = new Map(assets.map((asset) => [asset.id, asset]))

  const jobs = withThumbnails.flatMap((template) => {
    const asset = byId.get(template.thumbnailAssetId!)
    if (!asset) return []

    return [
      presignDownload(asset.thumbnailKey ?? asset.storageKey).then(
        (url) => [template.id, url] as const
      ),
    ]
  })

  return Object.fromEntries(await Promise.all(jobs))
}

/** Every asset of one template, plus the two singleton shortcuts a view needs. */
export async function presignTemplateAssets(
  template: FullTemplateSource
): Promise<Record<string, string>> {
  const jobs = template.assets.flatMap((asset) => {
    const entries: Promise<readonly [string, string]>[] = [
      presignDownload(asset.storageKey, asset.filename).then(
        (url) => [asset.id, url] as const
      ),
    ]

    if (asset.thumbnailKey) {
      entries.push(
        presignDownload(asset.thumbnailKey).then(
          (url) => [`${asset.id}:thumbnail`, url] as const
        )
      )
    }

    // Named aliases so a view can reach the tile and the mock-up without
    // knowing which asset id happens to be in the pointer today.
    if (asset.id === template.thumbnailAssetId) {
      entries.push(
        presignDownload(asset.thumbnailKey ?? asset.storageKey).then(
          (url) => ['thumbnail', url] as const
        )
      )
    }
    if (asset.id === template.previewAssetId) {
      entries.push(
        presignDownload(asset.previewKey ?? asset.storageKey).then(
          (url) => ['preview', url] as const
        )
      )
    }

    return entries
  })

  return Object.fromEntries(await Promise.all(jobs))
}

/** The tile and mock-up for one template, for the buyer's customiser view. */
export async function presignShowcase(
  template: Template
): Promise<Record<string, string>> {
  const ids = [template.thumbnailAssetId, template.previewAssetId].filter(
    (id): id is string => id !== null
  )
  if (ids.length === 0) return {}

  const assets = await prisma.templateAsset.findMany({
    where: { id: { in: ids } },
  })

  const jobs = assets.map(async (asset) => {
    const alias =
      asset.id === template.thumbnailAssetId ? 'thumbnail' : 'preview'
    const key =
      alias === 'thumbnail'
        ? (asset.thumbnailKey ?? asset.storageKey)
        : (asset.previewKey ?? asset.storageKey)
    return [alias, await presignDownload(key)] as const
  })

  return Object.fromEntries(await Promise.all(jobs))
}

// --- Shared guards ----------------------------------------------------------

/**
 * The row, or a 404, for someone who may edit it.
 *
 * Every write goes through here. Reads use `visibilityFilter`; writes need more
 * than visibility, and the permission on the route is only half of it — a
 * deleted template must be uneditable even by an administrator who still has
 * its id in a browser tab.
 */
/**
 * The template, if this actor is allowed to change it.
 *
 * It used to check only that the row existed: the route's TEMPLATE_MANAGE
 * permission was the whole authorisation, and only administrators held it. Now
 * that customers own templates too, existence is not enough — a site user
 * holding a template id must not be able to edit the operator's original with
 * it, and `canManage` is what says so.
 *
 * Not found and not yours read the same from outside, deliberately: which of
 * the two it is would tell an unauthorised caller that the id exists.
 */
async function requireManageable(
  templateId: string,
  actor: AuthenticatedActor
): Promise<Template> {
  const template = await prisma.template.findFirst({
    where: { id: templateId, deletedAt: null },
  })

  if (!template)
    throw new NotFoundError('Template not found.', { details: { templateId } })

  assertCanManage(actor, template)
  return template
}

/**
 * The pack size of a stocked product, or null when there is nothing to reconcile.
 *
 * Null for three different reasons that all mean the same thing to the caller:
 * the design names no product, the product is gone, or it is print-on-demand
 * and holds no stock. Only a product whose stock is actually counted can
 * disagree with a design about how many pieces are in a pack.
 */
async function stockedPackSizeOf(
  productId: string | null
): Promise<number | null> {
  if (!productId) return null

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { packSize: true, trackInventory: true },
  })

  if (!product || !product.trackInventory) return null
  return product.packSize
}

/**
 * The price fields a write may set, which is none unless the actor prices things.
 *
 * A design's price is the operator's decision, and PRICING_MANAGE is the
 * permission that says so — no customer role holds it. A head office or site
 * user editing their own copy of a design may send these fields; they are
 * dropped rather than refused, because their builder renders the price
 * read-only and a save that failed over a field the user could not see and did
 * not touch would be unexplainable from the screen they are looking at.
 *
 * Returns only the keys that were actually supplied, so an autosave carrying
 * neither field does not null out a price that was already set.
 */
async function pricingFields(
  dto: { price?: number; unitsPerPack?: number },
  actor: AuthenticatedActor
): Promise<{ price?: Prisma.Decimal; unitsPerPack?: number }> {
  if (!(await hasPermission(actor, Permission.PRICING_MANAGE))) return {}

  return {
    ...(dto.price !== undefined
      ? { price: new Prisma.Decimal(dto.price) }
      : {}),
    ...(dto.unitsPerPack !== undefined
      ? { unitsPerPack: dto.unitsPerPack }
      : {}),
  }
}

/**
 * Everything needed to render the template without reading the draft again.
 *
 * A copy rather than a reference — a reference is exactly what would let the row
 * move underneath a version that promised not to.
 */
function buildSnapshot(template: Template): TemplateSnapshot {
  return {
    code: template.code,
    name: template.name,
    description: template.description,
    productId: template.productId,
    // Frozen alongside the artwork, and also copied to the version's own
    // columns by `publishTemplate` — see the note on those.
    price: template.price === null ? null : template.price.toNumber(),
    unitsPerPack: template.unitsPerPack,
    categoryId: template.categoryId,
    theme: template.theme,
    orientation: template.orientation,
    aspectRatio: template.aspectRatio,
    widthValue: template.widthValue.toNumber(),
    heightValue: template.heightValue.toNumber(),
    dimensionUnit: template.dimensionUnit,
    bleedMargin: template.bleedMargin.toNumber(),
    safeMargin: template.safeMargin.toNumber(),
    canvasConfig: fromJson<Record<string, unknown>>(template.canvasConfig),
    layers: fromJson<readonly Record<string, unknown>[]>(template.layers),
    design: fromJsonOr<Record<string, unknown> | null>(template.design, null),
    canvasJson: template.canvasJson,
  }
}

/**
 * A code from the name, with a numeric suffix if it is taken.
 *
 * The builder's "New template" button has a name and no code, and asking a
 * designer to invent a unique identifier before they can draw anything is a
 * step nobody wants. Bounded rather than looping for ever: after a hundred
 * collisions the name is the problem, not the suffix.
 */
async function deriveCode(name: string): Promise<string> {
  const base =
    normaliseTemplateCode(name)
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'TEMPLATE'

  const taken = new Set(
    (
      await prisma.template.findMany({
        where: { code: { startsWith: base } },
        select: { code: true },
      })
    ).map((row) => row.code)
  )

  if (!taken.has(base)) return base

  for (let suffix = 2; suffix <= 100; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }

  // Falls back to something certainly free rather than failing the create.
  return `${base}-${Date.now().toString(36).toUpperCase()}`
}

/** A referenced product or category has to exist before a row points at it. */
async function assertReferencesExist(
  productId?: string,
  categoryId?: string
): Promise<void> {
  if (productId) {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    })
    if (!product) {
      throw new BusinessRuleError('That product does not exist.', {
        details: { productId },
      })
    }
  }

  if (categoryId) {
    const category = await prisma.productCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    })
    if (!category) {
      throw new BusinessRuleError('That category does not exist.', {
        details: { categoryId },
      })
    }
  }
}

/**
 * Turns the unique-code violation into the 409 it is.
 *
 * Caught rather than pre-checked: a `findFirst` before the write leaves a window
 * in which another create takes the code, and the database is the only place
 * that can decide without one.
 */
async function translateDuplicateCode(
  error: unknown,
  code: string
): Promise<unknown> {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return error
  }

  // `meta.target` cannot be trusted to name the column. PostgreSQL reported the
  // column list -- ['code'] -- and SQL Server reports the table, 'dbo.templates'.
  // Matching on it therefore worked under one database and silently failed under
  // the other, turning a duplicate code into an unexplained 500.
  //
  // So the question is asked of the database instead. `templates` has four
  // unique columns and only one of them is the code; a lookup says which was hit
  // rather than inferring it from an error message whose shape is a driver
  // detail. It only runs on the failure path, so it costs nothing on the way
  // through.
  //
  // Unscoped and including soft-deleted rows, because both are reasons the code
  // is taken: the unique index covers every row, so a deactivated template still
  // holds its code, and the catalogue is global rather than per-account.
  const clash = await prisma.template.findFirst({
    where: { code },
    select: { id: true, deletedAt: true },
  })

  if (!clash) return error

  return new ConflictError(
    clash.deletedAt
      ? `The code "${code}" belongs to a deleted template and cannot be reused.`
      : `A template with the code "${code}" already exists.`,
    { details: { code } }
  )
}

// --- Audit ------------------------------------------------------------------

/**
 * The template fields the audit log records a before and after for.
 *
 * The four artwork fields are included by fingerprint only — see
 * `templateForAudit`.
 */
const TEMPLATE_AUDIT_FIELDS = [
  'code',
  'name',
  'description',
  'productId',
  'categoryId',
  'price',
  'unitsPerPack',
  'theme',
  'orientation',
  'aspectRatio',
  'widthValue',
  'heightValue',
  'dimensionUnit',
  'bleedMargin',
  'safeMargin',
  'status',
  'visibility',
  'version',
  'canvasConfig',
  'layers',
  'design',
  'canvasJson',
] as const

const TEMPLATE_ASSET_AUDIT_FIELDS = [
  'kind',
  'filename',
  'contentType',
  'sizeBytes',
  'damDocumentId',
] as const

/** Deleted rows included: a removal is recorded from the row as it was. */
function readTemplateForAudit(templateId: string): Promise<Template> {
  return prisma.template.findUniqueOrThrow({ where: { id: templateId } })
}

/**
 * A template row with its artwork replaced by fingerprints.
 *
 * The design is the whole artwork — layers, canvas, embedded images — and it
 * changes on every autosave. Copying it into a log kept for seven years would
 * store every keystroke's document. A fingerprint records what the log needs:
 * that the artwork changed, and which content it changed between, which can be
 * matched against the immutable versions that *do* keep the full design.
 */
function templateForAudit(row: Template) {
  return {
    ...row,
    canvasConfig: fingerprint(row.canvasConfig),
    layers: fingerprint(row.layers),
    design: fingerprint(row.design),
    canvasJson: fingerprint(row.canvasJson),
  }
}

/** `sha256:3f1a9c0b2e7d (12,480 chars)`, or null for no content. */
function fingerprint(content: string | null): string | null {
  if (content === null) return null
  const digest = createHash('sha256').update(content).digest('hex').slice(0, 12)
  return `sha256:${digest} (${content.length.toLocaleString('en-NZ')} chars)`
}

/** Sorted, so the same set of accounts never reads as a change. */
async function templateAllowList(templateId: string): Promise<string[]> {
  const rows = await prisma.templateAccountVisibility.findMany({
    where: { templateId },
    select: { accountId: true },
  })
  return rows.map((row) => row.accountId).sort()
}
