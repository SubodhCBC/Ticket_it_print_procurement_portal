// src/components/admin/AdminSidebar.tsx
'use client'

import { useMemo, useState } from 'react'
import { getDataSource } from '@/services/data-source'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ChevronRight,
  Database,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useSidebar } from '@/hooks/useSidebar'
import { useAuth } from '@/hooks/useAuth'
import {
  ADMIN_MENU,
  findActiveHref,
  isSidebarGroup,
  useOpenGroups,
  type SidebarEntry,
  type SidebarLink,
} from '@/components/layout/sidebarMenu'

export function AdminSidebar({
  isCollapsed: propIsCollapsed,
  onToggleCollapse: propOnToggleCollapse,
}: {
  isCollapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const pathname = usePathname()
  const sidebar = useSidebar()

  // Determine if collapsed (prop overrides context if explicitly passed)
  const isMini =
    propIsCollapsed !== undefined ? propIsCollapsed : sidebar.isMiniSidebar
  const handleToggleCollapse = propOnToggleCollapse || sidebar.toggleMiniSidebar

  const [hoveredItem, setHoveredItem] = useState<string | null>(null)

  // Account settings (`/admin/settings`) need ACCOUNT_MANAGE, which only an
  // admin holds; head office would be sent to a page the API refuses. Approval
  // rules sit under the same path but are a separate, USER_MANAGE API.
  const { hasPermission } = useAuth()
  const canManageAccount = hasPermission('ACCOUNT_MANAGE')
  const menu = useMemo<readonly SidebarEntry[]>(
    () =>
      canManageAccount
        ? ADMIN_MENU
        : ADMIN_MENU.filter(
            (entry) => isSidebarGroup(entry) || entry.href !== '/admin/settings'
          ),
    [canManageAccount]
  )

  const activeHref = findActiveHref(pathname, menu)
  const groups = useOpenGroups(menu, activeHref)

  /** One page: a top-level link, a link inside an open group, or a mini icon. */
  const renderLink = (
    link: SidebarLink,
    { isCollapsed, nested }: { isCollapsed: boolean; nested: boolean }
  ) => {
    const isActive = link.href === activeHref
    const Icon = link.icon

    return (
      <div
        key={link.href}
        style={{ position: 'relative' }}
        onMouseEnter={() => setHoveredItem(link.href)}
        onMouseLeave={() => setHoveredItem(null)}
      >
        <Link
          href={link.href}
          onClick={() => sidebar.closeMobileDrawer()}
          aria-current={isActive ? 'page' : undefined}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: nested ? '10px' : '12px',
            padding: isCollapsed ? '10px 0' : nested ? '8px 10px' : '9px 12px',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            borderRadius: '10px',
            color: isActive ? '#FFFFFF' : '#DCD3E0',
            backgroundColor: isActive
              ? 'rgba(247, 53, 130, 0.16)'
              : 'transparent',
            textDecoration: 'none',
            fontSize: nested ? '0.82rem' : '0.86rem',
            fontWeight: isActive ? 700 : 500,
            transition: 'all 150ms ease',
            border: '1px solid transparent',
          }}
        >
          <Icon
            size={nested ? 16 : 18}
            color={isActive ? '#F73582' : '#A39BB3'}
            style={{ flexShrink: 0 }}
          />

          {!isCollapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                flex: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {link.title}
            </motion.span>
          )}

          {!isCollapsed && link.badge && (
            <span
              style={{
                fontSize: '0.62rem',
                padding: '2px 6px',
                borderRadius: '9999px',
                backgroundColor: '#58B97D',
                color: '#FFFFFF',
                fontWeight: 700,
              }}
            >
              {link.badge}
            </span>
          )}
        </Link>

        {/* Mini-Sidebar Floating Tooltip on Hover */}
        {isCollapsed && hoveredItem === link.href && (
          <div
            style={{
              position: 'absolute',
              left: '100%',
              top: '50%',
              transform: 'translateY(-50%)',
              marginLeft: '12px',
              backgroundColor: '#2B253E',
              color: '#FFFFFF',
              padding: '6px 12px',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              fontSize: '0.78rem',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              zIndex: 100,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{link.title}</span>
            {link.badge && (
              <span
                style={{
                  fontSize: '0.6rem',
                  padding: '1px 5px',
                  borderRadius: '9999px',
                  backgroundColor: '#58B97D',
                  color: '#FFFFFF',
                  fontWeight: 700,
                }}
              >
                {link.badge}
              </span>
            )}
          </div>
        )}
      </div>
    )
  }

  // Common navigation content inside sidebar
  /**
   * What the data-source badge should say.
   *
   * Derived from `getDataSource().isMock`, which the seam has exported for
   * exactly this since the API migration began and which nothing consumed. The
   * badge was hard-coded to "Mock Service Layer — ACTIVE" and stayed that way
   * after eight of nine domains moved to the live API, so the admin portal was
   * telling its operator it ran on fixtures while showing them real orders. A
   * status light that cannot be wrong is worth more than one that is pretty.
   */
  const { isMock, mockDomains } = getDataSource()
  const dataSourceColor = isMock ? '#F2B84B' : '#58B97D'
  const dataSourceTint = isMock
    ? 'rgba(242, 184, 75, 0.15)'
    : 'rgba(88, 185, 125, 0.15)'
  const dataSourceName = isMock ? 'Partial Mock Data' : 'Live API'
  const dataSourceTag = isMock ? `${mockDomains.length} MOCK` : 'LIVE'
  const dataSourceLabel = isMock
    ? `Served by the API except: ${mockDomains.join(', ')}`
    : 'Every domain is served by the backend API'

  const renderSidebarContent = (isDrawer = false) => {
    const isCollapsed = !isDrawer && isMini

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            padding: isCollapsed ? '16px 12px' : '16px 14px 16px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            minHeight: '70px',
            flexShrink: 0,
            gap: '8px',
          }}
        >
          <Link
            href="/admin/dashboard"
            onClick={() => sidebar.closeMobileDrawer()}
            title="Print Procurement Portal · Admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textDecoration: 'none',
              color: 'inherit',
              minWidth: 0,
              flex: 1,
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#F73582',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Sparkles size={19} color="#FFFFFF" />
            </div>

            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                style={{ minWidth: 0 }}
              >
                <div
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.25,
                    color: '#FFFFFF',
                    overflowWrap: 'break-word',
                  }}
                >
                  Print Procurement Portal
                  <span
                    style={{
                      display: 'inline-block',
                      marginLeft: '6px',
                      verticalAlign: '2px',
                      fontSize: '0.58rem',
                      lineHeight: 1,
                      letterSpacing: '0.04em',
                      color: '#FFFFFF',
                      backgroundColor: '#F73582',
                      padding: '3px 6px',
                      borderRadius: '9999px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                    }}
                  >
                    Admin
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.7rem',
                    color: '#A39BB3',
                    marginTop: '3px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Enterprise Platform HQ
                </div>
              </motion.div>
            )}
          </Link>

          {/* Drawer Close Button (Mobile) OR Mini-Sidebar Toggle Button (Desktop) */}
          {isDrawer ? (
            <button
              type="button"
              onClick={sidebar.closeMobileDrawer}
              aria-label="Close Sidebar Drawer"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#DCD3E0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                transition: 'background-color 0.15s ease',
              }}
            >
              <X size={18} />
            </button>
          ) : (
            !isCollapsed && (
              <button
                type="button"
                onClick={handleToggleCollapse}
                title="Collapse to Mini Sidebar"
                aria-label="Collapse sidebar"
                style={{
                  flexShrink: 0,
                  width: '30px',
                  height: '30px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#A39BB3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <PanelLeftClose size={15} />
              </button>
            )
          )}
        </div>

        {/* Navigation. Dashboard and Settings are links; every other entry is
            a group that opens to show its pages. */}
        <nav
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: isCollapsed ? '16px 8px' : '16px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {menu.map((entry, index) => {
            // No room for a dropdown in the mini sidebar, so a group lays its
            // pages out as icons, ruled off from the entries around it.
            if (isCollapsed) {
              const links = isSidebarGroup(entry) ? entry.children : [entry]
              return (
                <div
                  key={entry.title}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '3px',
                    ...(index > 0
                      ? {
                          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                          paddingTop: '6px',
                          marginTop: '2px',
                        }
                      : {}),
                  }}
                >
                  {links.map((link) =>
                    renderLink(link, { isCollapsed: true, nested: false })
                  )}
                </div>
              )
            }

            if (!isSidebarGroup(entry)) {
              return renderLink(entry, { isCollapsed: false, nested: false })
            }

            const GroupIcon = entry.icon
            const isOpen = groups.isOpen(entry.title)
            // The page's own link carries the highlight; its group is only
            // lifted enough to say where to look when it is closed.
            const holdsActive = entry.children.some(
              (link) => link.href === activeHref
            )

            return (
              <div key={entry.title}>
                <button
                  type="button"
                  onClick={() => groups.toggle(entry.title)}
                  aria-expanded={isOpen}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '9px 12px',
                    width: '100%',
                    borderRadius: '10px',
                    color: holdsActive ? '#FFFFFF' : '#DCD3E0',
                    backgroundColor: 'transparent',
                    border: '1px solid transparent',
                    fontFamily: 'inherit',
                    fontSize: '0.86rem',
                    fontWeight: holdsActive ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <GroupIcon
                    size={18}
                    color={holdsActive ? '#F73582' : '#A39BB3'}
                    style={{ flexShrink: 0 }}
                  />
                  <span
                    style={{
                      flex: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {entry.title}
                  </span>
                  <motion.span
                    animate={{ rotate: isOpen ? 90 : 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ display: 'flex' }}
                  >
                    <ChevronRight size={15} color="#A39BB3" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          margin: '2px 0 4px 21px',
                          paddingLeft: '10px',
                          borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                        }}
                      >
                        {entry.children.map((link) =>
                          renderLink(link, { isCollapsed: false, nested: true })
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </nav>

        {/* Footer: Quick Role Switch & Environment Status */}
        <div
          style={{
            padding: isCollapsed ? '12px 8px' : '14px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(0, 0, 0, 0.22)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          {isCollapsed ? (
            /* Mini Collapse Expand Trigger & Compact Status */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <button
                type="button"
                onClick={handleToggleCollapse}
                title="Expand Sidebar"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#DCD3E0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <PanelLeftOpen size={16} />
              </button>

              <div
                title={dataSourceLabel}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: dataSourceColor,
                }}
              />
            </div>
          ) : (
            /* Data-source badge. The portal switcher that used to sit here is
               gone: moving between portals is a matter of who you signed in
               as, so the only way across is to sign out and back in. */
            <>
              {/* Data source badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.7rem',
                  color: '#A39BB3',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Database size={13} color={dataSourceColor} />
                  <span>{dataSourceName}</span>
                </div>
                <span
                  title={dataSourceLabel}
                  style={{
                    fontSize: '0.62rem',
                    backgroundColor: dataSourceTint,
                    color: dataSourceColor,
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontWeight: 700,
                  }}
                >
                  {dataSourceTag}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 1. DESKTOP & TABLET SIDEBAR (VISIBLE ON SCREEN >= 768px) */}
      <aside
        className="admin-desktop-sidebar"
        style={{
          width: isMini ? '76px' : '272px',
          backgroundColor: '#2B253E',
          color: '#FFFFFF',
          minHeight: '100vh',
          height: '100vh',
          position: 'sticky',
          top: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          transition: 'width 240ms cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 40,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* 2. MOBILE SLIDE-OVER DRAWER (ACCESSIBLE ON SCREENS < 768px) */}
      <AnimatePresence>
        {sidebar.isMobileOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
              display: 'flex',
            }}
          >
            {/* Frosted Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={sidebar.closeMobileDrawer}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.68)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            />

            {/* Slide-in Drawer Container */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              style={{
                position: 'relative',
                width: '85vw',
                maxWidth: '310px',
                height: '100%',
                backgroundColor: '#2B253E',
                color: '#FFFFFF',
                boxShadow: '10px 0 40px rgba(0, 0, 0, 0.4)',
                borderRight: '1px solid rgba(255, 255, 255, 0.12)',
                zIndex: 1201,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {renderSidebarContent(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @media (max-width: 767px) {
          .admin-desktop-sidebar {
            display: none !important;
          }
        }
      `}</style>
    </>
  )
}
