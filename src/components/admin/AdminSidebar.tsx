// src/components/admin/AdminSidebar.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  ChevronRight,
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

  // The store's `windowWidth` had nobody reporting to it, so it sat at its
  // 1200px seed for the life of the session. Everything downstream of it was
  // therefore wrong on a phone: `sidebar.isMobile` read false, so the header's
  // hamburger toggled the MINI sidebar — which is `display: none` below 768px —
  // and the slide-over drawer could not be opened at all. This shell is mounted
  // on every admin page, so the measurement belongs here.
  //
  // Only band CHANGES are reported, for two reasons. `resize` fires
  // continuously while a window is dragged (and whenever a mobile URL bar
  // slides), and `setWindowWidth` re-asserts the mini sidebar for the whole
  // tablet band — so reporting every event would shut a tablet user's sidebar
  // the instant anything nudged the viewport. And a desktop mount reports
  // nothing at all: the seed is already a desktop width, and dispatching would
  // clear the remembered "keep it mini" preference on every page load.
  const sidebarActions = useRef(sidebar)
  sidebarActions.current = sidebar
  useEffect(() => {
    const bandFor = (width: number) =>
      width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'

    let band = bandFor(window.innerWidth)
    if (band !== 'desktop')
      sidebarActions.current.setWindowWidth(window.innerWidth)

    const handleResize = () => {
      const width = window.innerWidth
      const next = bandFor(width)
      if (next === band) return
      band = next
      sidebarActions.current.setWindowWidth(width)
      // Leaving phone width reveals the docked sidebar; an open drawer on top
      // of it would be two copies of the same navigation.
      if (next !== 'mobile') sidebarActions.current.closeMobileDrawer()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // The drawer covers the screen, so Escape has to close it, and the page
  // behind it must not scroll under the finger.
  useEffect(() => {
    if (!sidebar.isMobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        sidebarActions.current.closeMobileDrawer()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [sidebar.isMobileOpen])

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
            minHeight: '40px',
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

  // The sidebar used to end with a "Live API" badge. It reported whether any
  // domain still came from fixtures — a real warning while the migration was
  // half done. The fixtures are gone, so it could only ever read LIVE: an
  // indicator that cannot change states is telling nobody anything, and it was
  // developer wiring sitting in a customer's operator screen. If a status light
  // is wanted here, /health/dependencies is the thing to read.
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
                    overflowWrap: 'anywhere',
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
                  Administration
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
              className="touch-target"
              style={{
                width: '34px',
                height: '34px',
                flexShrink: 0,
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
                    minHeight: '40px',
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
            </div>
          ) : null}
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
              role="dialog"
              aria-modal="true"
              aria-label="Admin navigation"
              style={{
                position: 'relative',
                width: 'min(85vw, 310px)',
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
