// src/app/admin/templates/page.tsx
'use client'

import { SkeletonCardGrid } from '@/components/ui/Skeleton'
import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  LayoutTemplate,
  Plus,
  Search,
  Filter,
  Edit3,
  Trash2,
  Lock,
  Unlock,
  Users,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import {
  TemplateVisibilityBadge,
  TemplateVisibilityModal,
} from '@/components/admin/TemplateVisibilityModal'
import { useAuth } from '@/hooks/useAuth'
import { useTemplates, useTemplateMutations } from '@/hooks/useTemplates'
import type { PrintTemplate } from '@/types'

/**
 * ACCOUNT and PRIVATE templates belong to a customer; who sees them follows
 * from the owner, so they get no Visibility action here.
 */
function isCustomerOwnedTemplate(template: PrintTemplate): boolean {
  return template.visibility === 'ACCOUNT' || template.visibility === 'PRIVATE'
}

const CATEGORIES = [
  'All',
  'Signs',
  'Banners',
  'Business Cards',
  'Flyers',
  'Catalogue',
  'Template Design',
  'Posters',
  'Brochures',
]

export default function AdminTemplatesPage() {
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedStatus, setSelectedStatus] = useState<
    PrintTemplate['status'] | 'ALL'
  >('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const { hasPermission } = useAuth()
  // Admin only: head office can open this page but cannot set visibility.
  const canManageVisibility = hasPermission('TEMPLATE_MANAGE')
  const [visibilityTarget, setVisibilityTarget] =
    useState<PrintTemplate | null>(null)

  const {
    data: templates,
    isLoading,
    refetch,
  } = useTemplates({
    category: selectedCategory === 'All' ? undefined : selectedCategory,
    status: selectedStatus === 'ALL' ? undefined : selectedStatus,
    search: searchQuery || undefined,
  })

  const { deleteTemplate, publishTemplate, unpublishTemplate } =
    useTemplateMutations()

  const handleDelete = async (id: string, name: string) => {
    if (
      window.confirm(`Are you sure you want to delete the template "${name}"?`)
    ) {
      await deleteTemplate(id)
      refetch()
    }
  }

  const handleTogglePublish = async (template: PrintTemplate) => {
    if (template.status === 'PUBLISHED') {
      await unpublishTemplate(template.id)
    } else {
      await publishTemplate(template.id)
    }
    refetch()
  }

  return (
    <>
      {/* 1. Header Banner */}
      <AdminHeader
        title="Master Design Template Library"
        subtitle="Build reusable print templates, configure typography & layouts, and define exact editable vs locked fields for Site Users."
        actionButton={
          <Link
            href="/admin/templates/builder"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              backgroundColor: '#F73582',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Plus size={16} />
            Create Master Template
          </Link>
        }
      />

      {/* Main Content Area */}
      <main
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* 2. Filter & Search Controls */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            border: '1px solid #F0E6EC',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div
              style={{
                position: 'relative',
                flex: 1,
                minWidth: '260px',
                maxWidth: '420px',
              }}
            >
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#A39BB3',
                }}
              />
              <input
                type="text"
                placeholder="Search templates by title, category, or product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '36px',
                  paddingRight: '12px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  borderRadius: '10px',
                  border: '1px solid #F0E6EC',
                  fontSize: '0.84rem',
                  backgroundColor: '#FFFFFF',
                  color: '#2B253E',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.78rem',
                  color: '#6E6781',
                }}
              >
                <Filter size={16} color="#A39BB3" />
                <span>Status:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as any)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PUBLISHED">Published Only</option>
                  <option value="DRAFT">Drafts</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>
          </div>

          {/* Category Pills */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              overflowX: 'auto',
              paddingTop: '2px',
            }}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '9999px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: isSelected ? '#F73582' : '#F5EEF2',
                    color: isSelected ? '#FFFFFF' : '#5C566E',
                  }}
                >
                  {cat}
                </button>
              )
            })}
          </div>
        </div>

        {/* 3. Templates Grid */}
        {isLoading ? (
          <SkeletonCardGrid
            count={6}
            minWidth={320}
            label="Loading templates"
          />
        ) : templates.length === 0 ? (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              boxShadow:
                '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
              border: '1px solid #F0E6EC',
              padding: '32px',
              textAlign: 'center',
              maxWidth: '460px',
              margin: '24px auto',
            }}
          >
            <LayoutTemplate
              size={20}
              color="#DCD3E0"
              style={{ margin: '0 auto 8px auto' }}
            />
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#2B253E',
                margin: 0,
              }}
            >
              No Templates Found
            </h3>
            <p
              style={{
                fontSize: '0.84rem',
                color: '#A39BB3',
                marginTop: '4px',
                marginBottom: '16px',
              }}
            >
              No design templates match your filter criteria. Try resetting
              filters or create a new template.
            </p>
            <Link
              href="/admin/templates/builder"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                backgroundColor: '#F73582',
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <Plus size={16} />
              Create First Template
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '16px',
            }}
          >
            {templates.map((tpl) => {
              // The server's counts, because a listing carries no layers to
              // count. Falling back to the layers keeps a detail-shaped
              // template — a freshly created one, say — rendering correctly.
              const editableCount =
                tpl.editableFieldCount ??
                tpl.layers.filter((l) => l.isEditableBySiteUser).length
              const lockedCount =
                (tpl.layerCount ?? tpl.layers.length) - editableCount

              return (
                <motion.div
                  key={tpl.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow:
                      '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                    border: '1px solid #F0E6EC',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Visual Preview Header */}
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '16 / 10',
                      backgroundColor: tpl.canvasConfig.backgroundColor,
                      backgroundImage: tpl.canvasConfig.bgGradient || 'none',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '16px',
                    }}
                  >
                    {/* The tile the builder exported, signed by the API.
                        Preferred over the mini-proof below: it is what the
                        designer actually saw on the canvas, fonts, images and
                        all, where the proof can only approximate boxes it has
                        the layers for — and a listing has none. */}
                    {tpl.thumbnailUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={tpl.thumbnailUrl}
                        alt={`${tpl.name} preview`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          borderRadius: '4px',
                        }}
                      />
                    ) : tpl.layers.length === 0 ? (
                      /* No tile and no layers to draw. Saying so beats an empty
                         white rectangle that reads as a broken image. */
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          border: '1px dashed #DCD3E0',
                          color: '#A39BB3',
                          fontSize: '0.74rem',
                          fontWeight: 500,
                          textAlign: 'center',
                          padding: '8px',
                        }}
                      >
                        No preview yet — open the Studio Editor and save
                      </div>
                    ) : (
                      <div
                        style={{
                          position: 'relative',
                          width: '100%',
                          height: '100%',
                          borderRadius: '4px',
                          overflow: 'hidden',
                        }}
                      >
                        {tpl.layers.map((l) => (
                          <div
                            key={l.id}
                            style={{
                              position: 'absolute',
                              left: `${l.x}%`,
                              top: `${l.y}%`,
                              width: `${l.width}%`,
                              height: `${l.height}%`,
                              backgroundColor:
                                l.style.backgroundColor || 'transparent',
                              color: l.style.color || '#ffffff',
                              fontSize: `${Math.max((l.style.fontSize || 14) * 0.45, 8)}px`,
                              fontWeight: l.style.fontWeight || 600,
                              lineHeight: 1.2,
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            {l.type === 'text' && (
                              <span
                                style={{
                                  width: '100%',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  overflow: 'hidden',
                                }}
                              >
                                {l.content}
                              </span>
                            )}
                            {l.type === 'qrcode' && (
                              <span
                                style={{
                                  backgroundColor: '#fff',
                                  color: '#000',
                                  padding: '2px',
                                  fontSize: '7px',
                                  fontWeight: 700,
                                }}
                              >
                                QR
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Status Badge */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        backgroundColor:
                          tpl.status === 'PUBLISHED' ? '#ECFDF5' : '#FFFBEB',
                        color:
                          tpl.status === 'PUBLISHED' ? '#3F9C68' : '#B45309',
                      }}
                    >
                      {tpl.status}
                    </div>

                    {/* Category Pill */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        backgroundColor: '#F5EEF2',
                        color: '#5C566E',
                      }}
                    >
                      {tpl.category}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div
                    style={{
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      flex: 1,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '8px',
                        }}
                      >
                        <h3
                          style={{
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            color: '#2B253E',
                            margin: 0,
                          }}
                        >
                          {tpl.name}
                        </h3>
                        {/* Who can see it. A gallery row carries no grants,
                            so the count appears once the detail is loaded. */}
                        <TemplateVisibilityBadge template={tpl} />
                      </div>
                      <p
                        style={{
                          fontSize: '0.78rem',
                          color: '#6E6781',
                          margin: '4px 0 0 0',
                        }}
                      >
                        Target Product: <strong>{tpl.productName}</strong>
                      </p>
                      {/*
                        What this design sells for. An unpriced one says so
                        rather than showing nothing, because it is the reason
                        publish will refuse it.
                      */}
                      <p
                        style={{
                          fontSize: '0.78rem',
                          margin: '2px 0 0 0',
                          color:
                            tpl.price != null && tpl.unitsPerPack
                              ? '#2B253E'
                              : '#B45309',
                          fontWeight: 600,
                        }}
                      >
                        {tpl.price != null && tpl.unitsPerPack
                          ? `$${tpl.price.toFixed(2)} · $${(tpl.price / tpl.unitsPerPack).toFixed(2)} each / ${tpl.unitsPerPack} units`
                          : 'Not priced yet'}
                      </p>
                    </div>

                    {/* Rules summary. A plain meta line: the lock and unlock
                        icons already tell the two counts apart, so they no
                        longer need a boxed tile or green and red text. */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.76rem',
                        color: '#6E6781',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: 500,
                        }}
                      >
                        <Unlock size={14} color="#A39BB3" />
                        <span>{editableCount} Editable Fields</span>
                      </div>
                      <span style={{ color: '#DCD3E0' }}>•</span>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: 500,
                        }}
                      >
                        <Lock size={14} color="#A39BB3" />
                        <span>{lockedCount} Locked Elements</span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid #F5EEF2',
                        paddingTop: '12px',
                        marginTop: 'auto',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Link
                          href={`/admin/templates/${tpl.id}/edit`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: '10px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #F0E6EC',
                            color: '#2B253E',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          {/* Secondary, not pink: repeated on every card in
                              the grid, a primary button here would outshout
                              the page's one real call to action. */}
                          <Edit3 size={14} />
                          Studio Editor
                        </Link>

                        {/* Operator templates only: a customer's own design
                            is seen by whoever owns it, not granted from here. */}
                        {canManageVisibility &&
                          !isCustomerOwnedTemplate(tpl) && (
                            <button
                              type="button"
                              onClick={() => setVisibilityTarget(tpl)}
                              title="Visibility"
                              aria-label={`Set visibility for ${tpl.name}`}
                              style={{
                                padding: '6px',
                                borderRadius: '10px',
                                backgroundColor: '#FFFFFF',
                                border: '1px solid #F0E6EC',
                                color: '#6E6781',
                                cursor: 'pointer',
                              }}
                            >
                              <Users size={14} />
                            </button>
                          )}

                        <button
                          onClick={() => handleDelete(tpl.id, tpl.name)}
                          title="Delete Template"
                          style={{
                            padding: '6px',
                            borderRadius: '10px',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #FECACA',
                            color: '#DC2626',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <button
                        onClick={() => handleTogglePublish(tpl)}
                        style={{
                          padding: '6px 4px',
                          borderRadius: '10px',
                          backgroundColor: 'transparent',
                          color:
                            tpl.status === 'PUBLISHED' ? '#6E6781' : '#F73582',
                          border: 'none',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {tpl.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </main>

      {/* Rendered outside the grid: a fixed overlay inside a transformed
          motion.div would be positioned against the card, not the viewport. */}
      {canManageVisibility && visibilityTarget && (
        <TemplateVisibilityModal
          key={visibilityTarget.id}
          template={visibilityTarget}
          onClose={() => setVisibilityTarget(null)}
        />
      )}
    </>
  )
}
