// src/components/admin/ProductOptionAxesEditor.tsx
'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useProductAdminMutations } from '@/hooks/useProducts'
import type { AdminProductView, OptionAxisInput } from '@/types/catalog-admin'
import {
  ActionButton,
  Field,
  Notice,
  SectionHeading,
  TextInput,
} from './ProductAdminUi'
import { errorMessage } from './ProductAdminUtils'

const MAX_AXES = 8
const MAX_VALUES = 50

interface AxisDraft {
  key: number
  name: string
  values: string
}

function toDrafts(view: AdminProductView): AxisDraft[] {
  return [...view.options]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((option, index) => ({
      key: index,
      name: option.name,
      values: option.values.join(', '),
    }))
}

function splitValues(text: string): string[] {
  return text
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

/**
 * The option axes a variant's attributes are keyed on ("Size", "Finish").
 *
 * The whole set is replaced in one call. Each surviving value keeps its
 * surcharge; the server refuses a change that would orphan an existing
 * variant, and names the variants when it does. Parents remount this with a
 * key derived from the saved options, so a successful save resets the draft.
 */
export function ProductOptionAxesEditor({
  view,
  canManage,
}: {
  view: AdminProductView
  canManage: boolean
}) {
  const { setOptionAxes } = useProductAdminMutations(view.id)
  const [drafts, setDrafts] = useState<AxisDraft[]>(() => toDrafts(view))
  const [nextKey, setNextKey] = useState(view.options.length)
  const [error, setError] = useState<string | null>(null)
  const pending = setOptionAxes.isPending

  const update = (key: number, patch: Partial<AxisDraft>) => {
    setError(null)
    setDrafts((prev) =>
      prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft))
    )
  }

  const validate = (): OptionAxisInput[] | string => {
    if (drafts.length > MAX_AXES) return `At most ${MAX_AXES} option axes.`
    const names = new Set<string>()
    const axes: OptionAxisInput[] = []

    for (const draft of drafts) {
      const name = draft.name.trim()
      if (!name) return 'Every option needs a name.'
      if (name.length > 60) return `"${name}" is longer than 60 characters.`
      if (names.has(name.toLowerCase())) return `"${name}" appears twice.`
      names.add(name.toLowerCase())

      const values = splitValues(draft.values)
      if (values.length === 0) return `"${name}" needs at least one value.`
      if (values.length > MAX_VALUES)
        return `"${name}" has more than ${MAX_VALUES} values.`
      if (new Set(values).size !== values.length)
        return `"${name}" lists a value twice.`
      const tooLong = values.find((value) => value.length > 120)
      if (tooLong) return `A value of "${name}" is longer than 120 characters.`

      axes.push({ name, values })
    }
    return axes
  }

  const save = async () => {
    const result = validate()
    if (typeof result === 'string') {
      setError(result)
      return
    }
    setError(null)
    try {
      await setOptionAxes.mutateAsync(result)
    } catch (err) {
      setError(errorMessage(err, 'The options could not be saved.'))
    }
  }

  const saved = toDrafts(view)
  const isDirty =
    saved.length !== drafts.length ||
    saved.some(
      (axis, index) =>
        axis.name !== drafts[index]?.name.trim() ||
        splitValues(axis.values).join('|') !==
          splitValues(drafts[index]?.values ?? '').join('|')
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <SectionHeading
        title="Option axes"
        description="The choices a variant is built from, e.g. Size: A2, A3. Separate values with commas."
      />

      {!canManage && view.options.length === 0 && (
        <div style={{ fontSize: '0.8rem', color: '#A39BB3' }}>
          This product has no options.
        </div>
      )}

      {canManage ? (
        drafts.map((draft) => (
          <div
            key={draft.key}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 200px) minmax(0, 1fr) auto',
              gap: '10px',
              alignItems: 'end',
            }}
          >
            <Field label="Option name">
              <TextInput
                value={draft.name}
                maxLength={60}
                disabled={pending}
                placeholder="e.g. Size"
                onChange={(e) => update(draft.key, { name: e.target.value })}
              />
            </Field>
            <Field label="Values (comma-separated)">
              <TextInput
                value={draft.values}
                disabled={pending}
                placeholder="e.g. A4, A3, A2"
                onChange={(e) => update(draft.key, { values: e.target.value })}
              />
            </Field>
            <ActionButton
              variant="ghost"
              aria-label={`Remove option ${draft.name || ''}`}
              disabled={pending}
              icon={<X size={15} />}
              onClick={() => {
                setError(null)
                setDrafts((prev) => prev.filter((d) => d.key !== draft.key))
              }}
            >
              Remove
            </ActionButton>
          </div>
        ))
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {saved.map((axis) => (
            <div key={axis.key} style={{ fontSize: '0.84rem' }}>
              <strong style={{ color: '#2B253E' }}>{axis.name}:</strong>{' '}
              <span style={{ color: '#6E6781' }}>{axis.values}</span>
            </div>
          ))}
        </div>
      )}

      {canManage && view.variants.length > 0 && (
        <div style={{ fontSize: '0.76rem', color: '#A39BB3', lineHeight: 1.5 }}>
          Removing a value or an option that an existing variant uses is
          refused. Adding an option leaves existing variants without a value for
          it.
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      {canManage && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <ActionButton
            icon={<Plus size={15} />}
            disabled={pending || drafts.length >= MAX_AXES}
            onClick={() => {
              setDrafts((prev) => [
                ...prev,
                { key: nextKey, name: '', values: '' },
              ])
              setNextKey((key) => key + 1)
            }}
          >
            Add option
          </ActionButton>
          <ActionButton
            variant="primary"
            pending={pending}
            pendingLabel="Saving…"
            disabled={!isDirty}
            onClick={() => void save()}
          >
            Save options
          </ActionButton>
        </div>
      )}
    </div>
  )
}
