// src/components/dam/DamLibrary.tsx
'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import React, { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CloudUpload,
  FolderOpen,
  FolderPlus,
  House,
  KeyRound,
  Lock,
  PowerOff,
  RefreshCw,
  Search,
  SearchX,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  damKeys,
  useDamAccess,
  useDamCreateFolder,
  useDamDeleteFile,
  useDamFolderContents,
  useDamSearch,
  useDamUpload,
} from '@/hooks/useDam'
import { toApiError } from '@/services'
import {
  DAM_ACCEPT,
  DAM_IMAGE_ACCEPT,
  DAM_UPLOAD_MAX_FILE_BYTES,
  DAM_UPLOAD_MAX_FILES,
  DAM_UPLOAD_MAX_TOTAL_BYTES,
  isDamImage,
  validateDamFiles,
  type DamFile,
} from '@/services/dam.service'
import type { DamPickedImage } from './DamImagePicker'
import {
  damFileFolder,
  damFileKey,
  damPickProblem,
  folderHitPath,
  normaliseDamPath,
  trailFromPath,
  type DamCrumb,
} from './dam-format'
import { DamFileDetails } from './DamFileDetails'
import { DamNotice } from './DamNotice'
import { DamFileTile, DamFolderTile } from './DamTiles'

export interface DamLibraryProps {
  /**
   * `manage`: browse, upload and inspect (the library pages).
   * `select`: the same, plus choosing one picture (the picker).
   */
  mode?: 'manage' | 'select'
  /** Select mode: called with the chosen picture. */
  onPick?: (image: DamPickedImage) => void
  /** Offer upload when the user may upload. Default true. */
  allowUpload?: boolean
  /** Folder to open at. Defaults to the root. */
  initialFolderPath?: string | null
  pageSize?: number
}

/**
 * The image library: who may open it, then the browser itself.
 *
 * The gate comes first and holds no other hooks, so nothing below it asks the
 * library for a listing that is certain to be refused.
 */
export function DamLibrary(props: DamLibraryProps) {
  const access = useDamAccess()

  if (access.isLoading) {
    return <DamNotice loading title="Opening the image library..." />
  }

  if (access.error) {
    return (
      <DamNotice
        tone="danger"
        icon={<TriangleAlert size={22} />}
        title="Could not check the image library"
        message={toApiError(access.error).message}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw size={14} />}
            onClick={() => void access.refetch()}
            aria-label="Check the image library again"
          >
            Try again
          </Button>
        }
      />
    )
  }

  // No status at all means the status was never asked for: the role lacks
  // DAM_VIEW, and `reason` already says so.
  if (!access.status) {
    return (
      <DamNotice
        icon={<Lock size={22} />}
        title="You do not have access to the image library"
        message={access.reason ?? 'Your role cannot open the image library.'}
      />
    )
  }

  if (!access.status.enabled) {
    return (
      <DamNotice
        icon={<PowerOff size={22} />}
        title="The image library is switched off"
        message={
          access.reason ??
          'The image library is not switched on for this portal.'
        }
      />
    )
  }

  if (!access.status.connected) {
    return (
      <DamNotice
        icon={<KeyRound size={22} />}
        title="Sign in with your Ticket-IT account"
        message={
          <>
            {access.reason && (
              <span style={{ display: 'block', marginBottom: '6px' }}>
                {access.reason}
              </span>
            )}
            The image library lives in Ticket-IT and opens with your own
            Ticket-IT session. Accounts created only in this portal have none —
            sign out, then sign in with your Ticket-IT email and password.
          </>
        }
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw size={14} />}
            onClick={() => void access.refetch()}
            aria-label="Check my Ticket-IT session again"
          >
            Check again
          </Button>
        }
      />
    )
  }

  if (!access.canBrowse) {
    return (
      <DamNotice
        icon={<Lock size={22} />}
        title="The image library cannot be opened"
        message={access.reason ?? undefined}
      />
    )
  }

  return (
    <DamBrowser
      {...props}
      canUpload={access.canUpload}
      canDelete={access.canDelete}
    />
  )
}

// --- The browser -----------------------------------------------------------------

type Selection = { file: DamFile; folderPath: string | null }

const SEARCH_DELAY_MS = 300
/** Pause before re-listing a folder whose new files have not shown up yet. */
const RELIST_DELAY_MS = 1500

/** A folder name is a name, not a path: no separators, nothing Windows forbids. */
const UNSAFE_FOLDER_NAME = /[/\\:*?"<>|]/

/** The limits, in the words the drop zone uses them in. */
const MAX_FILE_MB = Math.round(DAM_UPLOAD_MAX_FILE_BYTES / 1_048_576)
const MAX_TOTAL_MB = Math.round(DAM_UPLOAD_MAX_TOTAL_BYTES / 1_048_576)

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms))

function DamBrowser({
  mode = 'manage',
  onPick,
  allowUpload = true,
  initialFolderPath = null,
  pageSize = 24,
  canUpload: mayUpload,
  canDelete,
}: DamLibraryProps & { canUpload: boolean; canDelete: boolean }) {
  const selectMode = mode === 'select'
  const canUpload = mayUpload && allowUpload
  const queryClient = useQueryClient()

  // --- Where we are ---------------------------------------------------------------
  const [trail, setTrail] = useState<DamCrumb[]>(() =>
    trailFromPath(initialFolderPath)
  )
  const folderPath = trail.length > 0 ? trail[trail.length - 1].path : null
  const folderLabel =
    trail.length > 0 ? trail[trail.length - 1].name : 'Library root'
  const [page, setPage] = useState(1)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [searchPage, setSearchPage] = useState(1)
  const searching = search.length > 0

  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return
    const timer = window.setTimeout(() => {
      setSearch(next)
      setSearchPage(1)
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput, search])

  const [selection, setSelection] = useState<Selection | null>(null)

  // --- Listings -----------------------------------------------------------------
  const contents = useDamFolderContents(
    { folderPath, page, pageSize },
    { enabled: !searching }
  )
  const results = useDamSearch({ search, page: searchPage, pageSize })

  // keepPreviousData also keeps the *last folder* on screen while a new one
  // loads. A previous page of this folder is fine to leave up; another
  // folder's files under this folder's breadcrumb would be a lie.
  const otherFolder =
    contents.data !== null &&
    normaliseDamPath(contents.data.folderPath) !== normaliseDamPath(folderPath)
  const folderData = !searching && !otherFolder ? contents.data : null
  const listing = searching ? results.data : folderData
  const view = searching ? results : contents
  const currentPage = searching ? searchPage : page
  const error = view.error ? toApiError(view.error) : null
  const firstLoad = !listing && (view.isLoading || view.isFetching)

  const items = listing?.items ?? []
  const files = items.filter((item) => item.kind === 'file')
  const folderTiles = dedupeFolders([
    ...(folderData?.folders ?? []).map((f) => ({ name: f.name, path: f.path })),
    ...items
      .filter((item) => item.kind === 'folder')
      .map((item) => ({ name: item.name, path: folderHitPath(item) })),
  ])

  // A listing refused for want of a session means the server has just dropped
  // the Ticket-IT token; re-reading the status flips the gate to say so.
  const sessionLost = error?.code === 'TICKETIT_SESSION_REQUIRED'
  useEffect(() => {
    if (sessionLost) {
      void queryClient.invalidateQueries({ queryKey: damKeys.status })
    }
  }, [sessionLost, queryClient])

  // --- Navigation ---------------------------------------------------------------
  function clearSearch() {
    setSearchInput('')
    setSearch('')
    setSearchPage(1)
  }

  function goTo(nextTrail: DamCrumb[]) {
    setTrail(nextTrail)
    setPage(1)
    setSelection(null)
    // A just-finished upload is looked for in its own folder only; once the
    // user leaves it, stop looking (and drop the "Looking for them" note).
    navRun.current += 1
    setLookingForUpload(false)
    // "X was deleted" belongs to the folder it was deleted from.
    setDeleteNotice(null)
    clearSearch()
  }

  function openFolder(folder: DamCrumb) {
    // From the folder view the tile is a child of what is open; from search it
    // could be anywhere, so the trail is rebuilt from its path.
    goTo(searching ? trailFromPath(folder.path) : [...trail, folder])
  }

  function pick(file: DamFile, fileFolder: string | null) {
    if (!onPick || !file.url || damPickProblem(file)) return
    onPick({
      url: file.url,
      name: file.name,
      folderPath: fileFolder,
      thumbnailUrl: file.thumbnailUrl,
      contentType: file.contentType,
    })
  }

  // --- Upload ---------------------------------------------------------------------
  const upload = useDamUpload()
  const fileInput = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [highlight, setHighlight] = useState<{
    folderPath: string | null
    names: ReadonlySet<string>
  } | null>(null)
  // Bumped whenever the open folder changes (or the browser unmounts), so a
  // post-upload lookup still running for the old folder knows to stop.
  const navRun = useRef(0)
  const [lookingForUpload, setLookingForUpload] = useState(false)
  useEffect(
    () => () => {
      navRun.current += 1
    },
    []
  )

  async function startUpload(chosen: File[]) {
    if (!canUpload || upload.isPending || chosen.length === 0) return
    setUploadError(null)
    setUploadNotice(null)

    // The server's own checks, first, so "too big" arrives before the upload.
    const problem = validateDamFiles(chosen)
    if (problem) {
      setUploadError(problem)
      return
    }

    const target = folderPath
    const targetLabel = folderLabel
    const targetPage = page
    const wasSearching = searching
    let names: readonly string[]
    try {
      const result = await upload.mutateAsync({
        files: chosen,
        folderPath: target,
      })
      // One entry per file sent, named as the library stores it. An entry whose
      // `confirmed` is false was stored but could not be found again — its name
      // is still the right one to look for, and the "not on this page yet"
      // notice below already covers the case where it never turns up.
      names =
        result.files.length > 0
          ? result.files.map((stored) => stored.name)
          : chosen.map((file) => file.name.trim())
    } catch (err) {
      setUploadError(toApiError(err).message)
      return
    }

    setHighlight({ folderPath: target, names: new Set(names) })
    setUploadNotice(
      names.length === 1
        ? `"${names[0]}" was uploaded to ${targetLabel}.`
        : `${names.length} files were uploaded to ${targetLabel}.`
    )
    // Search results would hide the folder the files just went into.
    clearSearch()

    // Find the new files in the folder. Here in the handler rather than in an
    // effect watching the listing: it has a clear end, and it stops as soon as
    // the user opens another folder. Ticket-IT's listing can lag its own
    // write, so an empty find is retried twice.
    const nav = navRun.current
    const preselect =
      selectMode &&
      chosen.length === 1 &&
      isDamImage({ name: chosen[0].name, contentType: chosen[0].type || null })
    setLookingForUpload(true)
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await wait(RELIST_DELAY_MS)
        if (navRun.current !== nav) return

        // The upload's invalidation has already re-read the open folder —
        // unless a search had its listing switched off — so the first look
        // reads the cache instead of asking Ticket-IT twice. Any miss falls
        // back to a real re-list.
        const cached =
          attempt === 0 && !wasSearching
            ? queryClient.getQueryData<NonNullable<typeof contents.data>>(
                damKeys.contents({
                  folderPath: target,
                  page: targetPage,
                  pageSize,
                })
              )
            : undefined
        const listing = cached ?? (await contents.refetch()).data
        if (navRun.current !== nav) return

        const arrived = (listing?.items ?? []).filter(
          (item) => item.kind === 'file' && names.includes(item.name)
        )
        if (arrived.length === 0) continue

        if (preselect) {
          const image = arrived.find((item) => !damPickProblem(item))
          if (image) {
            setSelection({
              file: image,
              folderPath: damFileFolder(image, target),
            })
          }
        }
        return
      }
    } finally {
      if (navRun.current === nav) setLookingForUpload(false)
    }
  }

  // --- Removing a file ------------------------------------------------------------
  const removeFile = useDamDeleteFile()
  const [confirming, setConfirming] = useState<Selection | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null)

  async function confirmDelete() {
    if (!confirming) return
    const { file, folderPath: fileFolder } = confirming
    setDeleteError(null)
    try {
      await removeFile.mutateAsync({
        fileName: file.name,
        folderPath: fileFolder,
        // Only the type the library itself reported. Guessing one risks naming
        // a type the library matches on and does not hold for this file.
        mimeType: file.contentType,
      })
    } catch (err) {
      // Stays open, so the message sits next to the button that caused it.
      setDeleteError(toApiError(err).message)
      return
    }
    setConfirming(null)
    setSelection(null)
    setDeleteNotice(`"${file.name}" was deleted from the library.`)
    // The mutation invalidates every `['dam']` key. This also re-reads the
    // listing on screen when it is not the one the cache just refetched.
    void view.refetch()
  }

  // --- Making a folder ------------------------------------------------------------
  const createFolder = useDamCreateFolder()
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderError, setNewFolderError] = useState<string | null>(null)

  async function submitNewFolder() {
    const name = newFolderName.trim()
    if (!name) {
      setNewFolderError('Give the folder a name.')
      return
    }
    if (name.length > 120 || UNSAFE_FOLDER_NAME.test(name)) {
      setNewFolderError(
        'A folder name must be 120 characters or fewer, and cannot contain a ' +
          'slash or any of : * ? " < > |'
      )
      return
    }

    // The library addresses some paths with backslashes; the new folder is
    // joined with whichever separator the folder it goes in already uses.
    const separator =
      folderPath?.includes('\\') && !folderPath.includes('/') ? '\\' : '/'
    const path = folderPath ? `${folderPath}${separator}${name}` : name

    setNewFolderError(null)
    let created: { folderPath: string }
    try {
      created = await createFolder.mutateAsync(path)
    } catch (err) {
      // Includes the case where the folder is already there: Ticket-IT does not
      // document what it answers then, and the server passes it straight
      // through, so its own words are the most honest thing to show.
      setNewFolderError(toApiError(err).message)
      return
    }
    setNewFolderOpen(false)
    setNewFolderName('')
    // Straight into the new folder, which is empty — so it is obvious it was
    // made, and a file can go in it without hunting for it in the grid.
    goTo(
      searching
        ? trailFromPath(created.folderPath)
        : [...trail, { name, path: created.folderPath }]
    )
  }

  const highlightedNames =
    highlight &&
    !searching &&
    normaliseDamPath(highlight.folderPath) === normaliseDamPath(folderPath)
      ? highlight.names
      : null
  const highlightedOnPage = highlightedNames
    ? files.filter((file) => highlightedNames.has(file.name)).length
    : 0

  function hasFiles(event: React.DragEvent) {
    return Array.from(event.dataTransfer.types).includes('Files')
  }

  const dropHandlers = {
    onDragEnter(event: React.DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (!canUpload) return
      dragDepth.current += 1
      setDragging(true)
    },
    onDragOver(event: React.DragEvent) {
      if (!hasFiles(event)) return
      // Always claimed, so a stray drop never navigates the tab to the file.
      event.preventDefault()
      event.dataTransfer.dropEffect =
        canUpload && !upload.isPending ? 'copy' : 'none'
    },
    onDragLeave(event: React.DragEvent) {
      if (!hasFiles(event) || !canUpload) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    },
    onDrop(event: React.DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (canUpload) void startUpload(Array.from(event.dataTransfer.files))
    },
  }

  // --- Rendering ------------------------------------------------------------------
  const selectionKey = selection
    ? damFileKey(selection.file, selection.folderPath)
    : null

  function fileFolderFor(file: DamFile) {
    // A search hit with no folder is somewhere unknown, not in the open folder.
    return damFileFolder(file, searching ? null : folderPath)
  }

  let body: React.ReactNode
  if (error) {
    body = (
      <DamNotice
        tone="danger"
        icon={
          sessionLost ? <KeyRound size={22} /> : <TriangleAlert size={22} />
        }
        title={
          sessionLost
            ? 'Your Ticket-IT session has ended'
            : searching
              ? 'Search failed'
              : 'Could not open this folder'
        }
        message={error.message}
        action={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw size={14} />}
              onClick={() => void view.refetch()}
              aria-label="Retry loading the image library"
            >
              Retry
            </Button>
            {/* The pager hides with the error, so a failed later page still
                has a way back. */}
            {currentPage > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => (searching ? setSearchPage(1) : setPage(1))}
                aria-label="Go back to the first page"
              >
                Back to page 1
              </Button>
            )}
          </>
        }
      />
    )
  } else if (firstLoad) {
    body = <LoadingGrid />
  } else if (folderTiles.length === 0 && files.length === 0) {
    body = searching ? (
      <DamNotice
        icon={<SearchX size={22} />}
        title="Nothing matches"
        message={`Nothing in the library matches "${search}".`}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearSearch}
            aria-label="Clear the search"
          >
            Clear search
          </Button>
        }
      />
    ) : currentPage > 1 ? (
      <DamNotice
        icon={<FolderOpen size={22} />}
        title="No more files"
        message="There is nothing on this page. Go back a page."
      />
    ) : (
      <DamNotice
        icon={<FolderOpen size={22} />}
        title="This folder is empty"
        message={
          canUpload
            ? 'Drop files here or use Upload to add some.'
            : 'There are no files or folders here yet.'
        }
      />
    )
  } else {
    body = (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          // The previous page stays up, faded, while the next one loads.
          opacity: view.isFetching ? 0.6 : 1,
          transition: 'opacity 150ms ease',
        }}
        aria-busy={view.isFetching}
      >
        {folderTiles.length > 0 && (
          <section aria-label="Folders">
            <SectionLabel>Folders</SectionLabel>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(170px, 100%), 1fr))',
                gap: '8px',
              }}
            >
              {folderTiles.map((folder) => (
                <DamFolderTile
                  key={folder.path}
                  name={folder.name}
                  onOpen={() => openFolder(folder)}
                />
              ))}
            </div>
          </section>
        )}

        <section aria-label="Files">
          {folderTiles.length > 0 && <SectionLabel>Files</SectionLabel>}
          {files.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#A39BB3' }}>
              {searching
                ? 'No files match — only folders.'
                : 'No files in this folder.'}
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(min(140px, 100%), 1fr))',
                gap: '10px',
              }}
            >
              {files.map((file) => {
                const fileFolder = fileFolderFor(file)
                const key = damFileKey(file, fileFolder)
                const problem = selectMode ? damPickProblem(file) : null
                return (
                  <DamFileTile
                    key={key}
                    file={file}
                    corsPreview={selectMode}
                    selected={key === selectionKey}
                    highlighted={Boolean(highlightedNames?.has(file.name))}
                    disabledReason={problem}
                    onSelect={() =>
                      setSelection({ file, folderPath: fileFolder })
                    }
                    onActivate={
                      selectMode ? () => pick(file, fileFolder) : undefined
                    }
                  />
                )
              })}
            </div>
          )}
        </section>
      </div>
    )
  }

  const showPager =
    !error && listing !== null && (currentPage > 1 || listing.hasMore)

  return (
    <div
      {...dropHandlers}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        minWidth: 0,
      }}
    >
      {/* Toolbar: where we are, search, upload. Wraps on narrow screens. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <Breadcrumbs
          trail={trail}
          dimmed={searching}
          onGo={(index) => goTo(trail.slice(0, index))}
        />
        <div style={{ flex: '1 1 220px', maxWidth: '100%', minWidth: 0 }}>
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search the whole library"
            aria-label="Search the image library"
            leftIcon={<Search size={15} />}
            rightIcon={
              searchInput ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear the search"
                  style={{
                    display: 'flex',
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    color: '#6E6781',
                    cursor: 'pointer',
                  }}
                >
                  <X size={15} />
                </button>
              ) : undefined
            }
          />
        </div>
        {canUpload && (
          <>
            <Button
              type="button"
              variant="outline"
              leftIcon={<FolderPlus size={15} />}
              onClick={() => {
                setNewFolderError(null)
                setNewFolderName('')
                setNewFolderOpen(true)
              }}
              aria-label={`Make a folder inside ${folderLabel}`}
            >
              New folder
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              accept={selectMode ? DAM_IMAGE_ACCEPT : DAM_ACCEPT}
              onChange={(event) => {
                const chosen = Array.from(event.target.files ?? [])
                // Cleared, so choosing the same file again still fires.
                event.target.value = ''
                void startUpload(chosen)
              }}
            />
            <Button
              type="button"
              leftIcon={<Upload size={15} />}
              isLoading={upload.isPending}
              onClick={() => fileInput.current?.click()}
              aria-label={`Upload files to ${folderLabel}`}
            >
              {upload.isPending ? 'Uploading...' : 'Upload'}
            </Button>
          </>
        )}
      </div>

      {canUpload && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '12px',
            border: `1.5px dashed ${dragging ? '#F73582' : '#F0E6EC'}`,
            backgroundColor: dragging ? '#FDE8F1' : '#FAF6F8',
            fontSize: '0.76rem',
            color: '#6E6781',
          }}
        >
          <CloudUpload size={18} color="#F73582" style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {upload.isPending ? (
              'Uploading... keep this window open until it finishes.'
            ) : (
              <>
                Drag {selectMode ? 'images' : 'images, PDFs or print artwork'}{' '}
                anywhere here to upload them to <strong>{folderLabel}</strong>.
                Up to {DAM_UPLOAD_MAX_FILES} files, {MAX_FILE_MB}MB each,{' '}
                {MAX_TOTAL_MB}MB in total.
              </>
            )}
          </span>
        </div>
      )}

      {uploadError && (
        <Banner tone="danger" onDismiss={() => setUploadError(null)}>
          {uploadError}
        </Banner>
      )}
      {deleteNotice && (
        <Banner tone="success" onDismiss={() => setDeleteNotice(null)}>
          {deleteNotice}
        </Banner>
      )}
      {uploadNotice && (
        <Banner tone="success" onDismiss={() => setUploadNotice(null)}>
          {uploadNotice}{' '}
          {lookingForUpload
            ? 'Looking for them in the folder...'
            : highlightedNames && highlightedOnPage === 0
              ? 'They are not on this page yet — they may be on another page, or take a moment to appear.'
              : highlightedNames
                ? 'They are marked New below.'
                : null}
        </Banner>
      )}

      {searching && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
            fontSize: '0.78rem',
            color: '#6E6781',
          }}
        >
          <span style={{ overflowWrap: 'anywhere' }}>
            Results for <strong style={{ color: '#2B253E' }}>“{search}”</strong>{' '}
            across the whole library
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearSearch}
            aria-label={`Clear the search and return to ${folderLabel}`}
          >
            Back to {folderLabel}
          </Button>
        </div>
      )}

      {selectMode && !error && files.length > 0 && (
        <p style={{ margin: 0, fontSize: '0.76rem', color: '#A39BB3' }}>
          Choose an image, then Use this image — or double-click it.
        </p>
      )}

      {/*
        Grid and details side by side while there is room for both, stacked
        when not. Flex-wrap rather than a media query, because the same layout
        sits in a full page and in a 1000px dialog on a phone.
      */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: '14px',
        }}
      >
        <div
          style={{
            flexGrow: 999,
            flexBasis: 0,
            // Below 55% of the row the details wrap underneath instead.
            minWidth: '55%',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {body}
          {showPager && listing && (
            <Pager
              page={currentPage}
              totalPages={listing.totalPages}
              total={listing.total}
              hasMore={listing.hasMore}
              busy={view.isFetching}
              onPrevious={() =>
                searching
                  ? setSearchPage((p) => Math.max(1, p - 1))
                  : setPage((p) => Math.max(1, p - 1))
              }
              onNext={() =>
                searching ? setSearchPage((p) => p + 1) : setPage((p) => p + 1)
              }
            />
          )}
        </div>

        {selection && (
          <div style={{ flexGrow: 1, flexBasis: '280px', minWidth: 0 }}>
            <DamFileDetails
              key={selectionKey}
              file={selection.file}
              folderPath={selection.folderPath}
              folderLabel={
                selection.folderPath ??
                (searching ? 'Unknown folder' : 'Library root')
              }
              pickProblem={
                selectMode ? damPickProblem(selection.file) : undefined
              }
              onPick={
                selectMode
                  ? () => pick(selection.file, selection.folderPath)
                  : undefined
              }
              onDelete={
                canDelete
                  ? () => {
                      setDeleteError(null)
                      setConfirming(selection)
                    }
                  : undefined
              }
              onClose={() => setSelection(null)}
            />
          </div>
        )}
      </div>

      {dragging && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            borderRadius: '14px',
            border: '2px dashed #F73582',
            backgroundColor: 'rgba(253, 232, 241, 0.88)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: '#2B253E',
            fontWeight: 700,
            fontSize: '0.9rem',
            textAlign: 'center',
            padding: '16px',
            // Pointer events off, so dragleave/drop still land on the wrapper.
            pointerEvents: 'none',
          }}
        >
          <CloudUpload size={32} color="#F73582" />
          Drop to upload to {folderLabel}
        </div>
      )}

      <NewFolderDialog
        open={newFolderOpen}
        parentLabel={folderLabel}
        name={newFolderName}
        error={newFolderError}
        busy={createFolder.isPending}
        onName={setNewFolderName}
        onSubmit={() => void submitNewFolder()}
        onClose={() => {
          if (createFolder.isPending) return
          setNewFolderOpen(false)
          setNewFolderError(null)
        }}
      />

      <DeleteFileDialog
        file={confirming}
        error={deleteError}
        busy={removeFile.isPending}
        onConfirm={() => void confirmDelete()}
        onClose={() => {
          if (removeFile.isPending) return
          setConfirming(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}

// --- Dialogs ------------------------------------------------------------------------

function NewFolderDialog({
  open,
  parentLabel,
  name,
  error,
  busy,
  onName,
  onSubmit,
  onClose,
}: {
  open: boolean
  parentLabel: string
  name: string
  error: string | null
  busy: boolean
  onName: (value: string) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <Modal isOpen={open} onClose={onClose} title="New folder" maxWidth="440px">
      {/* A form, so Enter submits — the whole dialog is one field. */}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) onSubmit()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
      >
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#6E6781' }}>
          The folder is made inside <strong>{parentLabel}</strong>.
        </p>
        <Input
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Folder name"
          aria-label="Folder name"
          autoFocus
          disabled={busy}
        />
        {error && (
          <span role="alert" style={{ fontSize: '0.76rem', color: '#DC2626' }}>
            {error}
          </span>
        )}
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={busy} disabled={busy}>
            {busy ? 'Creating...' : 'Create folder'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteFileDialog({
  file,
  error,
  busy,
  onConfirm,
  onClose,
}: {
  file: Selection | null
  error: string | null
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      isOpen={Boolean(file)}
      onClose={onClose}
      title="Delete this file?"
      maxWidth="440px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.82rem',
            color: '#2B253E',
            lineHeight: 1.55,
            overflowWrap: 'anywhere',
          }}
        >
          <strong>{file?.file.name}</strong> will be removed from{' '}
          {file?.folderPath ?? 'the library root'}. This is permanent and cannot
          be undone, and anything already using the file — a design, a product
          image — will lose its picture.
        </p>
        {error && (
          <span role="alert" style={{ fontSize: '0.76rem', color: '#DC2626' }}>
            {error}
          </span>
        )}
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          {/* A raw button, not `Button`: it has no destructive variant, and
              this is the one action on screen that must not look like the
              others. */}
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            aria-label={`Delete ${file?.file.name ?? 'this file'} permanently`}
            style={{
              padding: '0.5rem 0.9rem',
              borderRadius: '10px',
              border: '1px solid transparent',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? 'Deleting...' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// --- Pieces -------------------------------------------------------------------------

function dedupeFolders(folders: DamCrumb[]): DamCrumb[] {
  const seen = new Set<string>()
  return folders.filter((folder) => {
    if (seen.has(folder.path)) return false
    seen.add(folder.path)
    return true
  })
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#A39BB3',
        marginBottom: '8px',
      }}
    >
      {children}
    </div>
  )
}

function Breadcrumbs({
  trail,
  dimmed,
  onGo,
}: {
  trail: DamCrumb[]
  /** While searching the trail is where "Back" returns to, not what is shown. */
  dimmed: boolean
  /** Index into the trail to keep up to; 0 is the root. */
  onGo: (index: number) => void
}) {
  const crumbs = [{ name: 'Library', path: '' }, ...trail]
  return (
    <nav
      aria-label="Folder path"
      style={{ flex: '999 1 260px', minWidth: 0, opacity: dimmed ? 0.6 : 1 }}
    >
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '2px',
          fontSize: '0.82rem',
        }}
      >
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1
          return (
            <li
              key={`${i}-${crumb.path}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                minWidth: 0,
              }}
            >
              {i > 0 && (
                <ChevronRight size={14} color="#A39BB3" aria-hidden="true" />
              )}
              {last && !dimmed ? (
                <span
                  aria-current="page"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 6px',
                    fontWeight: 700,
                    color: '#2B253E',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {i === 0 && <House size={14} aria-hidden="true" />}
                  {crumb.name}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onGo(i)}
                  aria-label={
                    i === 0 ? 'Go to the library root' : `Go to ${crumb.name}`
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 6px',
                    border: 'none',
                    borderRadius: '6px',
                    background: 'transparent',
                    color: '#6E6781',
                    fontWeight: 600,
                    cursor: 'pointer',
                    overflowWrap: 'anywhere',
                    textAlign: 'left',
                  }}
                >
                  {i === 0 && <House size={14} aria-hidden="true" />}
                  {crumb.name}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function Pager({
  page,
  totalPages,
  total,
  hasMore,
  busy,
  onPrevious,
  onNext,
}: {
  page: number
  totalPages: number | null
  total: number | null
  hasMore: boolean
  busy: boolean
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        flexWrap: 'wrap',
        paddingTop: '4px',
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        leftIcon={<ChevronLeft size={14} />}
        onClick={onPrevious}
        disabled={page <= 1 || busy}
        aria-label="Previous page"
      >
        Previous
      </Button>
      <span style={{ fontSize: '0.78rem', color: '#6E6781' }}>
        Page {page}
        {totalPages !== null ? ` of ${totalPages}` : ''}
        {total !== null ? ` · ${total} ${total === 1 ? 'item' : 'items'}` : ''}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        rightIcon={<ChevronRight size={14} />}
        onClick={onNext}
        // The page on screen may be the previous one while the next loads;
        // its `hasMore` is stale then, so Next waits.
        disabled={!hasMore || busy}
        aria-label="Next page"
      >
        Next
      </Button>
    </div>
  )
}

function Banner({
  tone,
  onDismiss,
  children,
}: {
  tone: 'danger' | 'success'
  onDismiss: () => void
  children: React.ReactNode
}) {
  const danger = tone === 'danger'
  return (
    <div
      role={danger ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '12px',
        border: `1px solid ${danger ? '#FECACA' : '#CBE8D6'}`,
        backgroundColor: danger ? '#FEF2F2' : '#EEF8F2',
        color: danger ? '#DC2626' : '#3F9C68',
        fontSize: '0.78rem',
        fontWeight: 600,
      }}
    >
      {danger ? (
        <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
      ) : (
        <CircleCheck size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
      )}
      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        style={{
          display: 'flex',
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          padding: 0,
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <X size={15} />
      </button>
    </div>
  )
}

function LoadingGrid() {
  return (
    <div
      role="status"
      aria-label="Loading files"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(140px, 100%), 1fr))',
        gap: '10px',
      }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton
          key={i}
          height="auto"
          radius={12}
          style={{ aspectRatio: '4 / 5' }}
        />
      ))}
    </div>
  )
}
