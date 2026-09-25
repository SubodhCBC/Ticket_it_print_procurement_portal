// src/lib/design/history.ts
//
// Command-pattern undo/redo. Each discrete user action pushes one entry holding
// only the objects that actually changed - not a copy of the whole canvas - so a
// long session stays cheap in memory.

export type HistoryLabel =
  | 'add'
  | 'delete'
  | 'move'
  | 'resize'
  | 'rotate'
  | 'style'
  | 'text'
  | 'group'
  | 'ungroup'
  | 'mask'
  | 'unmask'
  | 'reorder'
  | 'paste'
  | 'duplicate'
  | 'canvas'

/**
 * One object captured with fabric's own serialization.
 *
 * Deliberately NOT the DesignObject model: that is the save format, and it is
 * lossy for undo. A mask's clipPath is anchored to its group's centre, while the
 * document model always stores clips as absolute; and rebuilding a group from
 * absolute children makes fabric recompute its bounds and shift everything.
 * Round-tripping either through the document corrupted the canvas on undo.
 * `toObject`/`enlivenObjects` is exact for groups, clips and images alike.
 */
export type ObjectSnapshot = {
  id: string
  /** Stacking position, so undo restores depth as well as geometry. */
  index: number
  data: Record<string, unknown>
}

/** One object's state before and after a command. `null` means it did not exist. */
export type ObjectDiff = {
  id: string
  before: ObjectSnapshot | null
  after: ObjectSnapshot | null
}

/** Canvas-level properties that changed (background, size, guides). */
export type CanvasDiff = {
  before: Record<string, unknown>
  after: Record<string, unknown>
}

export type HistoryEntry = {
  label: HistoryLabel
  at: number
  objects: ObjectDiff[]
  canvas?: CanvasDiff
}

export type HistoryState = {
  entries: HistoryEntry[]
  index: number
}

export const MAX_HISTORY = 100

export function emptyHistory(): HistoryState {
  return { entries: [], index: -1 }
}

/** Keyed for quick lookup. */
function indexById(objects: ObjectSnapshot[]): Map<string, ObjectSnapshot> {
  const m = new Map<string, ObjectSnapshot>()
  for (const o of objects) m.set(o.id, o)
  return m
}

/** Strings longer than this are compared by fingerprint, not character by character. */
const LONG_STRING = 4096

/** Opens a long string's stand-in: a character no picture source or text layer carries. */
const LONG_STRING_MARK = String.fromCharCode(0)

const fingerprints = new WeakMap<ObjectSnapshot, string>()

/**
 * A snapshot in comparable form, worked out once per snapshot.
 *
 * Its JSON, except that a very long string — a picture's source embedded as a
 * data URL, megabytes long — stands in as its length and a hash of characters
 * spread across it. Stringifying every embedded picture twice on every nudge
 * was most of the time a small edit took. Snapshots are never changed once
 * captured, so the result is kept with the snapshot.
 */
function fingerprint(snapshot: ObjectSnapshot): string {
  let print = fingerprints.get(snapshot)
  if (print === undefined) {
    print = JSON.stringify(snapshot, (_key, value: unknown) =>
      typeof value === 'string' && value.length > LONG_STRING
        ? longStringToken(value)
        : value
    )
    fingerprints.set(snapshot, print)
  }
  return print
}

/** Length, plus FNV-1a over ~2,000 characters across the string and its tail. */
function longStringToken(s: string): string {
  let hash = 0x811c9dc5
  const step = Math.max(1, Math.floor(s.length / 2000))
  for (let i = 0; i < s.length; i += step) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  for (let i = Math.max(0, s.length - 256); i < s.length; i++) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${LONG_STRING_MARK}${s.length}:${(hash >>> 0).toString(36)}`
}

/**
 * Compare two flat object lists and emit only what differs. Deep-equality is by
 * JSON string (see `fingerprint`), which is enough here: the object model is
 * plain data.
 */
export function diffObjects(
  before: ObjectSnapshot[],
  after: ObjectSnapshot[]
): ObjectDiff[] {
  const a = indexById(before)
  const b = indexById(after)
  const diffs: ObjectDiff[] = []

  for (const [id, next] of b) {
    const prev = a.get(id)
    if (!prev) {
      diffs.push({ id, before: null, after: next })
    } else if (fingerprint(prev) !== fingerprint(next)) {
      diffs.push({ id, before: prev, after: next })
    }
  }
  for (const [id, prev] of a) {
    if (!b.has(id)) diffs.push({ id, before: prev, after: null })
  }
  return diffs
}

/** Push a command, dropping any redo tail and trimming to MAX_HISTORY. */
export function pushEntry(
  state: HistoryState,
  entry: HistoryEntry
): HistoryState {
  if (!entry.objects.length && !entry.canvas) return state
  const entries = state.entries.slice(0, state.index + 1)
  entries.push(entry)
  while (entries.length > MAX_HISTORY) entries.shift()
  return { entries, index: entries.length - 1 }
}

export function canUndo(state: HistoryState): boolean {
  return state.index >= 0
}

export function canRedo(state: HistoryState): boolean {
  return state.index < state.entries.length - 1
}

/** The entry to reverse when undoing, and the resulting state. */
export function undoEntry(state: HistoryState): {
  entry: HistoryEntry | null
  next: HistoryState
} {
  if (!canUndo(state)) return { entry: null, next: state }
  return {
    entry: state.entries[state.index],
    next: { ...state, index: state.index - 1 },
  }
}

/** The entry to re-apply when redoing, and the resulting state. */
export function redoEntry(state: HistoryState): {
  entry: HistoryEntry | null
  next: HistoryState
} {
  if (!canRedo(state)) return { entry: null, next: state }
  const entry = state.entries[state.index + 1]
  return { entry, next: { ...state, index: state.index + 1 } }
}

/**
 * Apply a diff to an object list in one direction.
 * `direction: 'undo'` restores `before`, `'redo'` restores `after`.
 */
export function applyDiff(
  objects: ObjectSnapshot[],
  diffs: ObjectDiff[],
  direction: 'undo' | 'redo'
): ObjectSnapshot[] {
  const map = indexById(objects)
  for (const d of diffs) {
    const target = direction === 'undo' ? d.before : d.after
    if (target === null) map.delete(d.id)
    else map.set(d.id, target)
  }
  return [...map.values()].sort((a, b) => a.index - b.index)
}

/** Rough byte cost of the stack, for diagnostics. */
export function historyFootprint(state: HistoryState): number {
  return state.entries.reduce((sum, e) => sum + JSON.stringify(e).length, 0)
}
