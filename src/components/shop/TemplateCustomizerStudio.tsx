// src/components/shop/TemplateCustomizerStudio.tsx
'use client'

import { useState, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  Upload,
  FileText,
  RotateCcw,
  X,
  Download,
  Eye,
  Loader2,
  Check,
  Images,
} from 'lucide-react'
import {
  DamImagePicker,
  type DamPickedImage,
} from '@/components/dam/DamImagePicker'
import { useDamAccess, useDamSessionLost } from '@/hooks/useDam'
import { checkCanvasUrl } from '@/services/dam.service'
import {
  DAM_HOST_BLOCKED,
  DAM_PICTURE_SLOW,
  DAM_SESSION_ENDED,
  readFileAsDataUrl,
  storePictureInDam,
} from '@/lib/design/dam-images'
import { loadImageElement } from '@/lib/design/image-tools'
import {
  TemplateBuilderStudio,
  type StudioArtwork,
  type StudioHandle,
} from '@/components/admin/TemplateBuilderStudio'
import {
  readOrderArtwork,
  withoutOrderArtwork,
} from '@/lib/design/order-artwork'
import type { DesignDocument, DesignSide } from '@/types/design'
import type { PrintTemplate, TemplateLayer } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { exportProof, renderSidePreview } from '@/lib/design/proof-export'
import { printedBack, type ReviewIssue } from '@/lib/design/review-checks'
import type { ApiTemplateField } from '@/services/data-source/api/template.types'
import { CustomiseCheckoutOverlay } from './customise/CustomiseCheckoutOverlay'
import { SmallScreenNotice } from './customise/SmallScreenNotice'
import { prepareReview } from './customise/prepare-review'
import type { PreparedReview } from './customise/types'
import { OVERLAY_CLASS, T, overlayCss, primaryButton } from './customise/theme'

/**
 * Layer types a buyer can type into.
 *
 * Mirrors `PERSONALISABLE_TYPES` in the API's `template-status.ts`, and is only
 * reached when `fields` was not supplied — a preview, or a caller that has the
 * template but not the published view. The server's list is authoritative
 * wherever it is available, which is everywhere that matters.
 */
const PERSONALISABLE_TYPES = ['text', 'badge', 'qrcode', 'barcode']

/** Shown while a picked library picture is checked. */
const LIBRARY_LOADING_NOTICE = 'Loading your picture from the image library…'

/** The three ways to start a back of your own, as tiles. */
const startTile: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '14px 8px',
  borderRadius: '12px',
  border: `1px solid ${T.border}`,
  backgroundColor: T.card,
  cursor: 'pointer',
  minHeight: '104px',
}

const startTileLabel: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  color: T.text,
  textAlign: 'center',
  lineHeight: 1.25,
}

/** The secondary header buttons, which are all the same shape. */
const toolButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 12px',
  borderRadius: '10px',
  backgroundColor: T.card,
  border: `1px solid ${T.border}`,
  color: T.secondary,
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

/** The same button with only its icon, for a narrow header. */
const iconToolButton: React.CSSProperties = {
  ...toolButton,
  gap: 0,
  width: '36px',
  height: '36px',
  padding: 0,
  justifyContent: 'center',
}

/**
 * The buyer's own details, written onto the artwork once the canvas is up.
 *
 * The studio used to be a form beside a picture, and the form opened with the
 * branch's name already in it. Keeping that behaviour now means writing onto
 * the artwork, because the artwork is the only place a value lives - so the
 * design reads as unsaved from the start, which it honestly is: it no longer
 * matches what the operator published.
 *
 * Only where the profile actually has something. Leaving the designer's
 * placeholder alone is a better answer for a blank profile than replacing it
 * with an empty line.
 */
function profileDefaults(
  user: {
    siteName?: string | null
    name?: string | null
    email?: string | null
  } | null
): Record<string, string> {
  const out: Record<string, string> = {}
  if (user?.siteName) out.businessName = user.siteName
  if (user?.name) out.contactName = user.name
  if (user?.email) out.email = user.email
  return out
}

interface TemplateCustomizerStudioProps {
  template: PrintTemplate

  /**
   * The fields the **server** says this buyer may fill in.
   *
   * Authoritative. The studio used to work this out itself — every layer marked
   * editable, minus images — and got a different answer from the API: a
   * rectangle marked editable by accident became a text box labelled "Rect"
   * that did nothing whatever was typed into it, while the server's own field
   * list, its validator and its editable-field count all correctly ignored it.
   *
   * Two derivations of one rule is one rule too many. This is the rule.
   */
  fields?: readonly ApiTemplateField[]

  /**
   * The published version this artwork came from.
   *
   * Carried all the way to the cart line, and the reason the buyer's values
   * mean anything later: without it an order holds answers with no question —
   * "businessName = Apex" says nothing about which poster, in what font, where.
   *
   * Optional so a preview that has no version can still render the studio, but
   * adding to the cart without one is refused rather than allowed to produce a
   * line nobody can print.
   */
  templateVersionId?: string
  templateVersion?: number

  /**
   * The basket line this personalisation came from, when the buyer is
   * returning to one.
   *
   * Present, the final step updates that line instead of adding a second.
   * Absent, it adds one.
   */
  existingLineId?: string

  /**
   * The values that line already holds, when resuming one.
   *
   * Seeded into the form rather than merged with the designer's defaults: a
   * buyer who cleared a field and saved meant to clear it, and re-filling it
   * from the placeholder would undo that silently.
   */
  savedValues?: Record<string, string>

  /** The resumed line's quantity, in packs. */
  savedQuantity?: number

  /** The resumed line's configuration — `{ Paper: 'Silk 350gsm' }`. */
  savedOptions?: Record<string, string> | null
}

export function TemplateCustomizerStudio({
  template,
  fields,
  templateVersionId,
  existingLineId,
  savedValues,
  savedQuantity,
  savedOptions,
}: TemplateCustomizerStudioProps) {
  const { user } = useAuth()

  const [isExporting, setIsExporting] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * The studio's handle onto the live canvas.
   *
   * A ref rather than state: the handle reads through the studio's own refs, so
   * it never goes stale, and storing it in state would re-render this page for
   * a value that has not changed.
   */
  const studioRef = useRef<StudioHandle | null>(null)

  /** The design a resumed cart line is holding, if it holds one. */
  const savedArtwork = useMemo(
    () => readOrderArtwork(savedValues),
    [savedValues]
  )

  /* ── Back print ───────────────────────────────────────────────
     A design can offer several reverses -- plain, opening hours, a QR to the
     booking page -- and the buyer prints one of them, or none. The studio can
     show any of them; this is the choice that travels with the order. */

  const [sides, setSides] = useState<{ id: string; name: string }[]>([])

  /**
   * The back being printed. Null prints the back blank.
   *
   * Blank until the buyer picks one. A designer's back — opening hours, a QR
   * code — is an offer, not something to put on the reverse of somebody's
   * cards because they never opened the picker. A resumed line keeps the back
   * it was saved with.
   *
   * Never cleared when the list of backs changes: every reader resolves this
   * against the backs actually on the artwork, so an id whose back has gone
   * simply prints blank, and comes back if an undo restores it.
   */
  const savedBackId = savedArtwork
    ? (printedBack(savedArtwork)?.id ?? null)
    : null
  const [chosenBackId, setChosenBackId] = useState<string | null>(savedBackId)
  // The cart can finish loading after this page does, so the saved line — and
  // its back — can arrive a render late.
  const [seededBackId, setSeededBackId] = useState<string | null>(savedBackId)
  if (seededBackId !== savedBackId) {
    setSeededBackId(savedBackId)
    setChosenBackId(savedBackId)
  }
  const printingBack = sides.find((side) => side.id === chosenBackId) ?? null

  /**
   * The buyer's latest say about the back.
   *
   * Bumped by everything that decides it: starting a back, choosing one,
   * uploading or picking a picture for one, Reset. A picture still uploading
   * when the buyer makes another choice is dropped when it arrives, instead of
   * adding a back and choosing it over the choice they made meanwhile — and two
   * library picks in quick succession add one back, the later one.
   */
  const backSeqRef = useRef(0)
  const nextBackSeq = () => {
    // A superseded pick's "Loading…" would otherwise hang about for its full
    // time over whatever the buyer did next.
    setNotice((prev) => (prev === LIBRARY_LOADING_NOTICE ? null : prev))
    backSeqRef.current += 1
    return backSeqRef.current
  }

  /**
   * Whether the studio has a picture uploading. Reported through its dirty
   * callback, which fires when an upload starts and when it ends.
   */
  const [studioUploading, setStudioUploading] = useState(false)

  /**
   * Re-read the backs from the canvas.
   *
   * Not from the template: a buyer with the full studio can add a back of their
   * own, and a picker that listed only the designer's would have no way to name
   * the one they are looking at.
   */
  const refreshSides = useCallback(() => {
    const live = studioRef.current?.sides()
    if (!live) return
    // Only when it actually changed. `sides()` builds a fresh array every call,
    // so setting it unconditionally is a state change on every call — and this
    // is called from the studio's dirty callback, which fires on every edit.
    setSides((prev) => {
      const same =
        prev.length === live.backs.length &&
        prev.every(
          (side, i) =>
            side.id === live.backs[i].id && side.name === live.backs[i].name
        )
      return same ? prev : live.backs
    })
  }, [])

  /** Pick a back, or `null` for a blank one, and show it. */
  const chooseBack = (backId: string | null) => {
    nextBackSeq()
    setChosenBackId(backId)
    // Show it as well as choose it. Picking a back you cannot see, on a screen
    // built to show you what you are buying, is a choice made blind.
    studioRef.current?.showSide(backId)
  }

  /**
   * The artwork, trimmed to the back that was chosen — or to none.
   *
   * The studio holds every back; an order holds one at most. Production reads
   * this document and prints what is in it, so leaving three backs on it would
   * leave the press to guess, and leaving one the buyer never chose would print
   * it.
   */
  const withChosenBack = (
    design: DesignDocument | undefined
  ): DesignDocument | undefined => {
    if (!design) return design
    const chosen = (design.backs ?? []).find((side) => side.id === chosenBackId)
    if (!chosen) return { ...design, backs: [], defaultBackId: null }
    return { ...design, backs: [chosen], defaultBackId: chosen.id }
  }

  /**
   * The print preview the operator's builder has, of what this buyer receives.
   *
   * The studio on its own would show the designer's default back. An order
   * carries the back this buyer picked, or none — the same trim
   * `withChosenBack` applies — so the preview is told which.
   */
  const handlePreview = async () => {
    const studio = studioRef.current
    if (!studio || isPreviewing) return
    setIsPreviewing(true)
    try {
      await studio.openPreview({ backId: printingBack?.id ?? null })
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleStudioReady = useCallback(
    (api: StudioHandle) => {
      studioRef.current = api
      // A buyer returning to a saved line gets what they saved, placeholders
      // and blanks included: they cleared that field on purpose.
      refreshSides()
      if (savedValues && Object.keys(savedValues).length > 0) return
      const defaults = profileDefaults(user)
      if (Object.keys(defaults).length > 0) api.applyValues(defaults)
    },
    [savedValues, user, refreshSides]
  )

  /**
   * Stable, deliberately.
   *
   * An inline arrow here is a new function every render, and the studio reports
   * dirtiness through an effect: new identity, effect re-runs, setState, new
   * render, new identity. The page went round that loop until React stopped it.
   */
  const handleDirtyChange = useCallback(() => {
    // A back added, renamed or removed is an edit, so this is the moment the
    // picker's list can have changed.
    refreshSides()
    // An upload starting or finishing is reported here too. Next waits for it.
    setStudioUploading(studioRef.current?.isUploading() ?? false)
  }, [refreshSides])

  /**
   * Remounts the studio, which is what "Reset" means here.
   *
   * Rebuilding from the published template is the whole operation, and a
   * remount does it exactly.
   */
  const [resetCount, setResetCount] = useState(0)

  /**
   * The artwork the studio opens on.
   *
   * A buyer returning to a saved line gets their own design back; everyone else
   * gets the operator's published one. Either way this is a copy in memory:
   * nothing the studio does reaches the template row, because in this mode
   * nothing in it calls the templates API — see `onArtworkSave`.
   *
   * A saved line holds only the back it prints, so the designer's other backs
   * are put back beside it: re-opening a line must not take away the choice.
   */
  const workingTemplate = useMemo<PrintTemplate>(() => {
    // After a reset it is the published design that is wanted, which is the
    // whole point of the button - not the saved line this page opened on.
    const saved = resetCount === 0 ? savedArtwork : null
    if (!saved) return template

    const own = saved.backs ?? []
    const published = template.design?.backs ?? []
    const backs: DesignSide[] = [
      ...published.map(
        (side) => own.find((mine) => mine.id === side.id) ?? side
      ),
      ...own.filter((mine) => !published.some((side) => side.id === mine.id)),
    ]
    return {
      ...template,
      design: { ...saved, backs, defaultBackId: saved.defaultBackId ?? null },
    }
  }, [template, savedArtwork, resetCount])

  /**
   * What the buyer is offered, and what is locked — decided by the server.
   *
   * Keyed by layer id, which is how the published layers and the canvas both
   * name them, so a value read off the artwork can be matched to the field the
   * server will check it against.
   */
  const serverFields = new Map(
    (fields ?? []).map((field) => [field.layerId, field])
  )

  const isOffered = (l: TemplateLayer) =>
    fields
      ? serverFields.has(l.id)
      : // No field list to go on. The same rule, stated once here, rather than
        // the older and looser "anything editable that is not an image".
        l.isEditableBySiteUser && PERSONALISABLE_TYPES.includes(l.type)

  /** The keys the published design will accept a value for. */
  const offeredKeys = new Set(
    template.layers.filter(isOffered).map((l) => l.fieldKey || l.id)
  )

  const flash = (message: string, ms = 3200) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(message)
    noticeTimer.current = setTimeout(() => setNotice(null), ms)
  }

  /**
   * The buyer's wording, read off the canvas.
   *
   * Filtered to the fields the published design actually offers. A buyer can
   * add text of their own now, and that text is part of their artwork rather
   * than an answer to one of the designer's fields — sending it as one would be
   * refused by the server, which rebuilds this record from the published
   * layers.
   */
  const valuesFromArtwork = (artwork: StudioArtwork | null) => {
    const out = withoutOrderArtwork(savedValues)
    for (const [key, value] of Object.entries(artwork?.values ?? {})) {
      if (offeredKeys.has(key)) out[key] = value
    }
    return out
  }

  /**
   * The artwork at the moment it is asked for.
   *
   * Null while the studio is still mounting, which is the one state in which
   * there is nothing to review rather than something empty.
   */
  const currentArtwork = () => studioRef.current?.getArtwork() ?? null

  /**
   * The back chooser, and the pictures in it.
   *
   * A name in a dropdown is not a choice anybody can make about artwork. The
   * grid shows each back as it will print, rendered through the same path the
   * PDF uses, so what is picked is what arrives.
   */
  const [backPickerOpen, setBackPickerOpen] = useState(false)
  const [backPreviews, setBackPreviews] = useState<Record<string, string>>({})
  const [renderingBacks, setRenderingBacks] = useState(false)
  const backFileRef = useRef<HTMLInputElement>(null)

  // The image library. A site user may browse it but not upload, so their own
  // back is embedded as before; head office uploads. Neither is offered to a
  // user with no Ticket-IT session.
  const { canBrowse: canBrowseDam, canUpload: canUploadDam } = useDamAccess()
  const damSessionLost = useDamSessionLost()
  const damSessionToldRef = useRef(false)
  const [backLibraryOpen, setBackLibraryOpen] = useState(false)

  // Pictures on their way to becoming a back — uploads into the library, and
  // checks that a picked one can be used. Counted: two can overlap.
  const [backWork, setBackWork] = useState({ upload: 0, load: 0 })
  const backUploading = backWork.upload > 0
  const trackBackWork = async <T,>(
    kind: 'upload' | 'load',
    work: () => Promise<T>
  ): Promise<T> => {
    setBackWork((w) => ({ ...w, [kind]: w[kind] + 1 }))
    try {
      return await work()
    } finally {
      setBackWork((w) => ({ ...w, [kind]: w[kind] - 1 }))
    }
  }

  /**
   * Why Next and Export wait, if they do.
   *
   * A picture still on its way is not in the artwork yet. A review, a cart
   * line or a PDF made now would be made without it, and the picture would
   * turn up on the canvas afterwards, on a design already sent on.
   */
  const pictureWait =
    backUploading || studioUploading
      ? 'Wait for your picture to finish uploading'
      : backWork.load > 0
        ? 'Wait for your picture to finish loading'
        : null

  /** True, and says why, when Next or Export must wait. */
  const mustWaitForPicture = () => {
    const reason =
      pictureWait ??
      (studioRef.current?.isUploading()
        ? 'Wait for your picture to finish uploading'
        : null)
    if (reason) flash(`${reason}, then try again.`)
    return reason !== null
  }

  const openBackPicker = async () => {
    setBackPickerOpen(true)
    const artwork = currentArtwork()
    const design = artwork?.design
    if (!design?.backs?.length) return

    setRenderingBacks(true)
    try {
      const shots: Record<string, string> = {}
      for (const side of design.backs) {
        shots[side.id] = await renderSidePreview(
          { ...template, design },
          side.objects,
          valuesFromArtwork(artwork),
          360
        )
      }
      setBackPreviews(shots)
    } finally {
      setRenderingBacks(false)
    }
  }

  /**
   * A back made of one picture — embedded, or a library URL — opened.
   *
   * `studio` is the studio the request began in. A Reset while the picture was
   * uploading remounts it, and the published design it starts again from must
   * not gain a back asked for before the reset. `seq` is the buyer's choice it
   * was asked for under — see `backSeqRef`. True when the back was added.
   */
  const addImageBack = async (
    src: string,
    studio: StudioHandle | null,
    seq: number
  ): Promise<boolean> => {
    // With CORS for a URL, as the canvas will load it.
    const probe = await loadImageElement(src).catch(() => null)
    if (!probe || studioRef.current !== studio || seq !== backSeqRef.current) {
      return false
    }
    const id = studio?.addBack(
      {
        image: src,
        naturalWidth: probe.naturalWidth,
        naturalHeight: probe.naturalHeight,
      },
      'My back design'
    )
    if (id) setChosenBackId(id)
    refreshSides()
    setBackPickerOpen(false)
    return true
  }

  /**
   * A picture the buyer was sent, dropped in as a new back.
   *
   * Into the image library first when this buyer may upload there, so the
   * cart line carries an address instead of the picture; embedded as before
   * when they may not, or when the library refuses it.
   */
  const handleBackImage = async (file: File) => {
    const studio = studioRef.current
    const seq = nextBackSeq()
    if (!canUploadDam) {
      const src = await readFileAsDataUrl(file).catch(() => '')
      if (src) await addImageBack(src, studio, seq)
      return
    }
    await trackBackWork('upload', async () => {
      const stored = await storePictureInDam(file, file.name)
      // No session any more: the library status is refreshed so it stops
      // being offered, and the picture is embedded without an error. Said once.
      const quiet = !stored.ok && damSessionLost(stored.code)
      if (quiet && !damSessionToldRef.current) {
        damSessionToldRef.current = true
        flash(DAM_SESSION_ENDED, 6000)
      }
      if (stored.ok) {
        await addImageBack(stored.url, studio, seq)
        return
      }
      if (seq !== backSeqRef.current) return
      const src = await readFileAsDataUrl(file).catch(() => '')
      if (!src || !(await addImageBack(src, studio, seq)) || quiet) return
      flash(
        `Your picture was kept inside the design instead: ${stored.reason}`,
        5200
      )
    })
  }

  /** A picture from the image library as a new back. Never embedded. */
  const handleBackLibraryPick = async (picked: DamPickedImage) => {
    const studio = studioRef.current
    const seq = nextBackSeq()
    flash(LIBRARY_LOADING_NOTICE, 15_000)
    await trackBackWork('load', async () => {
      const check = await checkCanvasUrl(picked.url)
      // Superseded: the buyer has chosen something since.
      if (seq !== backSeqRef.current) return
      if (check !== 'ok') {
        flash(
          check === 'timeout'
            ? `That picture can't be used right now: ${DAM_PICTURE_SLOW}. Try again in a moment.`
            : `That picture can't be used here: ${DAM_HOST_BLOCKED}.`,
          5200
        )
        return
      }
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
      setNotice(null)
      await addImageBack(picked.url, studio, seq)
    })
  }

  const startBack = (kind: 'blank' | 'front') => {
    nextBackSeq()
    const id = studioRef.current?.addBack(
      kind,
      kind === 'front' ? 'Same as front' : 'My back design'
    )
    if (id) setChosenBackId(id)
    refreshSides()
    setBackPickerOpen(false)
  }

  /**
   * Exports the proof as a print-ready PDF.
   *
   * Rendered from the design the buyer is looking at, not from the operator's:
   * they may have moved half of it. Rendered rather than screenshotted for the
   * reason `proof-export` gives — a picture of a web page carries the browser's
   * font fallbacks into something a printer works from.
   */
  const handleExport = async () => {
    if (mustWaitForPicture()) return
    const artwork = currentArtwork()
    const design = withChosenBack(artwork?.design ?? template.design)
    if (!design) {
      flash(
        'This design has no export data. Ask an administrator to re-save it.'
      )
      return
    }

    setIsExporting(true)
    try {
      await exportProof({
        template: {
          ...template,
          design,
          layers: artwork?.layers ?? template.layers,
        },
        values: valuesFromArtwork(artwork),
        filename: `${template.name || 'artwork'}-proof`,
      })
    } catch (err) {
      flash((err as Error)?.message || 'The proof could not be exported.')
    } finally {
      setIsExporting(false)
    }
  }

  /** Back to the published design — wording, layout and a blank back. */
  const handleResetAll = () => {
    nextBackSeq()
    setResetCount((n) => n + 1)
    setChosenBackId(null)
    flash('Back to the original design.')
  }

  /**
   * Ctrl+S inside the studio.
   *
   * Must stay wired: without a handler the builder saves to the operator's
   * template. There is nothing to save to here — the design lives on this page
   * until Next puts it in the cart — so it says so.
   */
  const handleArtworkSave = () => {
    flash(
      'Your design is kept while you work — click Next to add it to your cart.',
      4200
    )
  }

  /* ── Next: review, final steps, cart ─────────────────────────── */

  const [review, setReview] = useState<PreparedReview | null>(null)
  const [preparing, setPreparing] = useState(false)

  /**
   * Snapshots the artwork and opens the review.
   *
   * The snapshot is what gets approved and what goes in the cart, so the
   * previews, the list of things to check and the thumbnail the cart line
   * carries are all made from the same document, here, once.
   */
  const handleNext = async () => {
    if (preparing || mustWaitForPicture()) return
    const artwork = currentArtwork()
    const design = withChosenBack(artwork?.design)
    if (!artwork || !design) {
      flash('Your design is still loading. Try again in a moment.')
      return
    }

    setPreparing(true)
    try {
      setReview(
        await prepareReview({
          template,
          design,
          values: valuesFromArtwork(artwork),
          fallbackThumbnail: artwork.thumbnailUrl,
        })
      )
    } catch (err) {
      flash(
        (err as Error)?.message ||
          'We could not prepare a preview of your design. Please try again.'
      )
    } finally {
      setPreparing(false)
    }
  }

  /** From the review's list of fields: back to the canvas, on that side. */
  // Under ~900px the header's secondary actions keep their icons and drop
  // their words, so the header stays one row instead of three.
  const compactHeader = useMediaQuery('(max-width: 899.98px)')

  /**
   * A phone gets the notice instead of the canvas.
   *
   * False on the server and on the first client render, so the studio is what
   * hydrates and the notice arrives after mount — no mismatch, and no new
   * layout for a laptop, which never matches this query.
   */
  const tooNarrowForCanvas = useMediaQuery('(max-width: 767.98px)')

  const handleEditIssue = (issue: ReviewIssue) => {
    const backId = review?.design.backs?.[0]?.id ?? null
    setReview(null)
    studioRef.current?.showSide(issue.side === 'back' ? backId : null)
  }

  /* Review → final steps → cart. Held in one place because a phone shows it
     without the studio underneath it. */
  const checkout = review ? (
    <CustomiseCheckoutOverlay
      template={template}
      templateVersionId={templateVersionId}
      prepared={review}
      existingLineId={existingLineId}
      savedQuantity={savedQuantity}
      savedOptions={savedOptions}
      onClose={() => setReview(null)}
      onEditIssue={handleEditIssue}
    />
  ) : null

  /* On a phone: the notice, or the checkout the buyer already opened — which
     is usable at 360px even though the canvas behind it is not. */
  if (tooNarrowForCanvas) {
    return checkout ?? <SmallScreenNotice />
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: T.page,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <style>{overlayCss}</style>

      {/* 1. STUDIO HEADER */}
      <header
        style={{
          position: 'relative',
          minHeight: '60px',
          backgroundColor: T.card,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          padding: '8px 16px',
          flexShrink: 0,
          zIndex: 30,
          gap: '12px',
        }}
      >
        {/* Left: back to the gallery, and what is being designed */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            minWidth: 0,
          }}
        >
          <Link
            href="/shop/templates"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              backgroundColor: T.page,
              color: T.secondary,
              textDecoration: 'none',
              border: `1px solid ${T.border}`,
              flexShrink: 0,
            }}
            title="Back to the design gallery"
            aria-label="Back to the design gallery"
            className="touch-target"
          >
            <ArrowLeft size={16} />
          </Link>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                // So the name can give way on a tablet rather than pushing the
                // header's actions off the screen.
                minWidth: 0,
              }}
            >
              <span
                className="truncate"
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: T.text,
                  maxWidth: '300px',
                }}
              >
                {template.name}
              </span>
              {template.category && (
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: T.accentSoft,
                    color: T.accent,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {template.category}
                </span>
              )}
            </div>
            <div
              style={{ fontSize: '0.72rem', color: T.muted, marginTop: '2px' }}
            >
              {/* The unit once: `3.543" × 2.165" in` said inches twice. */}
              {template.dimensions.width} &times; {template.dimensions.height}{' '}
              {template.dimensions.unit} · {template.orientation} · 300 DPI
              print-ready
            </div>
          </div>
        </div>

        {/* Right: reset, the back, export — and Next.

            Undo, redo and everything else that acts on the artwork live in the
            studio's own toolbar below, where the artwork is. */}
        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleResetAll}
            className="touch-target"
            style={compactHeader ? iconToolButton : toolButton}
            title="Start again from the published design"
            aria-label="Reset"
          >
            <RotateCcw size={14} /> {!compactHeader && 'Reset'}
          </button>

          {/* Which back is being printed.
              Only when the design offers one. A single-sided flyer has no
              choice to make, and an empty picker beside it would suggest there
              was one it had failed to load. */}
          {sides.length > 0 && (
            <button
              type="button"
              onClick={() => void openBackPicker()}
              className="touch-target"
              style={{ ...toolButton, maxWidth: '240px' }}
              title="What prints on the back. Blank unless you choose a design."
            >
              <span style={{ color: T.muted }}>Back:</span>
              <span
                style={{
                  color: T.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {printingBack?.name ?? 'Blank'}
              </span>
              <span aria-hidden="true">▾</span>
            </button>
          )}

          {/* The same preview the operator's builder opens: every side, drawn
              as it will print, and turnable. Rendering takes a beat on a heavy
              design, so the button says so rather than looking ignored. */}
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={isPreviewing}
            aria-busy={isPreviewing}
            title="See your design as it will print"
            aria-label="Preview"
            className="touch-target"
            style={{
              ...(compactHeader ? iconToolButton : toolButton),
              opacity: isPreviewing ? 0.6 : 1,
            }}
          >
            {isPreviewing ? (
              <Loader2 size={14} className={`${OVERLAY_CLASS}-spin`} />
            ) : (
              <Eye size={14} />
            )}{' '}
            {!compactHeader && (isPreviewing ? 'Rendering…' : 'Preview')}
          </button>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting || pictureWait !== null}
            title={pictureWait ?? 'Download a print-ready PDF of your proof'}
            aria-label="Export"
            className="touch-target"
            style={{
              ...(compactHeader ? iconToolButton : toolButton),
              opacity: isExporting || pictureWait ? 0.6 : 1,
              cursor: pictureWait ? 'not-allowed' : 'pointer',
            }}
          >
            {isExporting ? (
              <Loader2 size={14} className={`${OVERLAY_CLASS}-spin`} />
            ) : (
              <Download size={14} />
            )}{' '}
            {!compactHeader && (isExporting ? 'Exporting…' : 'Export')}
          </button>

          <button
            type="button"
            onClick={() => void handleNext()}
            disabled={preparing || pictureWait !== null}
            aria-busy={preparing}
            title={pictureWait ?? undefined}
            className="touch-target"
            style={{
              ...primaryButton(false),
              padding: '9px 20px',
              cursor: preparing
                ? 'progress'
                : pictureWait
                  ? 'not-allowed'
                  : 'pointer',
              opacity: preparing || pictureWait ? 0.8 : 1,
            }}
          >
            {preparing ? (
              <>
                <Loader2 size={15} className={`${OVERLAY_CLASS}-spin`} />
                Preparing…
              </>
            ) : pictureWait ? (
              <>
                <Loader2 size={15} className={`${OVERLAY_CLASS}-spin`} />
                Waiting for picture…
              </>
            ) : (
              <>
                Next <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>

        {notice && (
          <div
            role="status"
            style={{
              position: 'absolute',
              top: '100%',
              right: '16px',
              marginTop: '8px',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: T.text,
              color: '#FFFFFF',
              fontSize: '0.8rem',
              fontWeight: 500,
              boxShadow: '0 8px 24px rgba(43, 37, 62, 0.25)',
              zIndex: 40,
              maxWidth: 'min(420px, calc(100vw - 32px))',
            }}
          >
            {notice}
          </div>
        )}
      </header>

      {/* 2. THE STUDIO
          The operator's builder, on the buyer's own working copy.

          Not a second canvas written to look like the first one. Masking,
          grouping, the pen, the properties panel and every keyboard shortcut
          are one implementation, and a fix to any of them arrives here on the
          same day it arrives in the admin. What changes is where the artwork
          goes: `onArtworkSave` keeps it on this page, and Next takes it to the
          cart, so a buyer can rework a design as far as they like without the
          operator's template - the one every other branch prints from - moving
          at all.

          `key` is the reset button. Rebuilding the studio from the published
          template is what "start again" means, and remounting does it without
          a second undo stack that knows how to unwind a reset. */}
      <TemplateBuilderStudio
        key={`${template.id}:${resetCount}`}
        initialTemplate={workingTemplate}
        isNew={false}
        mode="customise"
        canPublish={false}
        showHeader={false}
        onReady={handleStudioReady}
        onDirtyChange={handleDirtyChange}
        onArtworkSave={handleArtworkSave}
      />

      {/* BACK PRINT CHOOSER
          Shown as artwork, not as a list of names: the buyer is choosing what
          prints on the reverse of the thing they are holding. */}
      <AnimatePresence>
        {backPickerOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(43, 37, 62, 0.55)',
              backdropFilter: 'blur(4px)',
              zIndex: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
            onClick={() => setBackPickerOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Design the back"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              onClick={(e) => e.stopPropagation()}
              // .drawer-panel sets the width: 460px where there is room for it,
              // the screen less a margin where there is not.
              className="drawer-panel"
              style={
                {
                  '--drawer-w': '460px',
                  height: '100%',
                  backgroundColor: T.card,
                  boxShadow: '-12px 0 40px rgba(43, 37, 62, 0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                } as React.CSSProperties
              }
            >
              <div
                style={{
                  padding: '20px 24px 14px',
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '1.2rem',
                        fontWeight: 700,
                        color: T.text,
                      }}
                    >
                      Design the back
                    </h3>
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: '0.8rem',
                        color: T.secondary,
                        lineHeight: 1.45,
                      }}
                    >
                      The back prints blank unless you pick one of the designs
                      prepared for this template, or start one of your own.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBackPickerOpen(false)}
                    className="touch-target"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: T.muted,
                      flexShrink: 0,
                    }}
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
                {/* Start one of your own */}
                <div
                  style={{
                    display: 'grid',
                    // Four tiles sit two by two; three stay in a row.
                    gridTemplateColumns: canBrowseDam
                      ? 'repeat(2, 1fr)'
                      : 'repeat(3, 1fr)',
                    gap: '10px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => startBack('front')}
                    style={startTile}
                  >
                    <Copy size={18} color={T.secondary} />
                    <span style={startTileLabel}>
                      Duplicate the front design
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => backFileRef.current?.click()}
                    disabled={backUploading}
                    aria-busy={backUploading}
                    style={{
                      ...startTile,
                      cursor: backUploading ? 'progress' : 'pointer',
                      opacity: backUploading ? 0.7 : 1,
                    }}
                  >
                    {backUploading ? (
                      <Loader2
                        size={18}
                        color={T.secondary}
                        className={`${OVERLAY_CLASS}-spin`}
                      />
                    ) : (
                      <Upload size={18} color={T.secondary} />
                    )}
                    <span style={startTileLabel}>
                      {backUploading ? 'Uploading…' : 'Upload your design'}
                    </span>
                  </button>
                  {canBrowseDam && (
                    <button
                      type="button"
                      onClick={() => {
                        // Closed first: the library is a dialog of its own and
                        // should not open underneath this drawer.
                        setBackPickerOpen(false)
                        setBackLibraryOpen(true)
                      }}
                      style={startTile}
                    >
                      <Images size={18} color={T.secondary} />
                      <span style={startTileLabel}>
                        Choose from image library
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => startBack('blank')}
                    style={startTile}
                  >
                    <FileText size={18} color={T.secondary} />
                    <span style={startTileLabel}>Start from blank</span>
                  </button>
                </div>
                <input
                  ref={backFileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleBackImage(file)
                    e.target.value = ''
                  }}
                />

                <h4
                  style={{
                    margin: '22px 0 10px',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    color: T.text,
                  }}
                >
                  Back designs
                </h4>

                {sides.length === 0 && (
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: T.secondary,
                      margin: '0 0 12px',
                    }}
                  >
                    This template has no back designs yet. Start one above and
                    it prints on the reverse.
                  </p>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '12px',
                  }}
                >
                  {[{ id: null, name: 'Blank back' }, ...sides].map((side) => {
                    const blank = side.id === null
                    const chosen = blank
                      ? printingBack === null
                      : side.id === printingBack?.id
                    return (
                      <button
                        key={side.id ?? '__blank'}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => {
                          chooseBack(side.id)
                          setBackPickerOpen(false)
                        }}
                        style={{
                          padding: '8px',
                          borderRadius: '12px',
                          border: `1px solid ${chosen ? T.accent : T.border}`,
                          boxShadow: chosen
                            ? `inset 0 0 0 1px ${T.accent}`
                            : 'none',
                          backgroundColor: chosen ? T.accentSoft : T.card,
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: template.aspectRatio
                              ? template.aspectRatio.replace(':', ' / ')
                              : '16 / 10',
                            borderRadius: '8px',
                            border: blank
                              ? `1px dashed ${T.muted}`
                              : `1px solid ${T.border}`,
                            backgroundColor: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          {/* The back that prints, marked on its picture
                              rather than appended to its name. */}
                          {chosen && (
                            <span
                              style={{
                                position: 'absolute',
                                top: '6px',
                                right: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 7px 2px 5px',
                                borderRadius: '999px',
                                backgroundColor: T.accent,
                                color: '#FFFFFF',
                                fontSize: '0.64rem',
                                fontWeight: 700,
                                zIndex: 1,
                              }}
                            >
                              <Check size={10} strokeWidth={3} /> Printing
                            </span>
                          )}
                          {blank ? (
                            <span
                              style={{ fontSize: '0.68rem', color: T.muted }}
                            >
                              Nothing printed
                            </span>
                          ) : backPreviews[side.id as string] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={backPreviews[side.id as string]}
                              alt={side.name}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                              }}
                            />
                          ) : (
                            <span
                              style={{ fontSize: '0.68rem', color: T.muted }}
                            >
                              {renderingBacks ? 'Rendering…' : 'No preview'}
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: chosen ? T.accent : T.text,
                            padding: '0 2px',
                          }}
                        >
                          {side.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {canBrowseDam && (
        <DamImagePicker
          isOpen={backLibraryOpen}
          onClose={() => setBackLibraryOpen(false)}
          onPick={(picked) => void handleBackLibraryPick(picked)}
          allowUpload={canUploadDam}
          title="Choose a picture for the back"
        />
      )}

      {/* 3. REVIEW → FINAL STEPS → CART */}
      {checkout}
    </div>
  )
}
