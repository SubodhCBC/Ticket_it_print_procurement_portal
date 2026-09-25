// src/components/layout/SaaSLayout.tsx
'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LogOut,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'

import { useAuth } from '@/hooks/useAuth'
import { ROLE_DETAILS } from '../../types/auth'
import { PortalLogo } from '../ui/PortalLogo'
import {
  ADMIN_MENU,
  HEAD_OFFICE_MENU,
  SITE_USER_MENU,
  findActiveHref,
  isSidebarGroup,
  useOpenGroups,
  type SidebarLink,
} from './sidebarMenu'

interface SaaSLayoutProps {
  children: React.ReactNode
  activeSection?: string
  onSectionChange?: (section: string) => void
}

export function SaaSLayout({ children }: SaaSLayoutProps) {
  const pathname = usePathname()
  const { user, role, logout } = useAuth()

  const [isMiniSidebar, setIsMiniSidebar] = useState(false)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false)
  const [hoveredNav, setHoveredNav] = useState<string | null>(null)
  const [windowWidth, setWindowWidth] = useState(1200)

  const isMobile = windowWidth < 768

  const currentRoleDetails = role ? ROLE_DETAILS[role] : ROLE_DETAILS.admin

  // Responsive breakpoint tracking.
  //
  // The sidebar is collapsed when the window ENTERS the tablet band, not on
  // every resize event inside it. `resize` fires continuously while a window is
  // dragged — and on mobile browsers whenever the URL bar slides — so setting
  // the mini state on each event meant a tablet user who opened the sidebar had
  // it shut again the moment anything nudged the viewport, with no way to keep
  // it open. Remembering which band we were last in makes it a one-shot.
  useEffect(() => {
    /** 'mobile' | 'tablet' | 'desktop' for a given width. */
    const bandFor = (width: number) =>
      width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'

    let band = bandFor(window.innerWidth)

    const handleResize = () => {
      const width = window.innerWidth
      setWindowWidth(width)

      const next = bandFor(width)
      if (next === band) return
      band = next

      // Entering the tablet band collapses the sidebar once; the user is then
      // free to open it again and it stays open.
      if (next === 'tablet') setIsMiniSidebar(true)
      if (next !== 'mobile') setIsMobileDrawerOpen(false)
    }

    // The first run sets the width and applies the band we start in, since
    // `windowWidth` is seeded with a desktop guess for the server render.
    setWindowWidth(window.innerWidth)
    if (band === 'tablet') setIsMiniSidebar(true)
    if (band !== 'mobile') setIsMobileDrawerOpen(false)

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Close mobile drawer on route change. Adjusted during render rather than in
  // an effect, so the old route's open drawer never paints on the new one.
  const [drawerPath, setDrawerPath] = useState(pathname)
  if (pathname !== drawerPath) {
    setDrawerPath(pathname)
    setIsMobileDrawerOpen(false)
  }

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobile && isMobileDrawerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobile, isMobileDrawerOpen])

  // Escape closes the mobile drawer. It covers the whole screen, so without
  // this the one key everybody tries left the reader stuck behind it.
  useEffect(() => {
    if (!isMobileDrawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setIsMobileDrawerOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isMobileDrawerOpen])

  // An administrator can open the shop and head-office portals too, and keeps
  // the admin menu there.
  const menu =
    role === 'admin'
      ? ADMIN_MENU
      : role === 'head_office'
        ? HEAD_OFFICE_MENU
        : SITE_USER_MENU
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
        onMouseEnter={() => setHoveredNav(link.href)}
        onMouseLeave={() => setHoveredNav(null)}
      >
        <Link
          href={link.href}
          onClick={() => setIsMobileDrawerOpen(false)}
          aria-current={isActive ? 'page' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            gap: '0.75rem',
            padding: isCollapsed
              ? '0.75rem 0'
              : nested
                ? '0.55rem 0.75rem'
                : '0.65rem 0.85rem',
            minHeight: '40px',
            borderRadius: '10px',
            color: isActive ? '#ffffff' : '#A39BB3',
            background: isActive ? 'rgba(247, 53, 130, 0.16)' : 'transparent',
            border: '1px solid transparent',
            textDecoration: 'none',
            fontWeight: isActive ? 700 : 500,
            fontSize: nested ? '0.8rem' : '0.82rem',
            transition: 'all 0.15s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              minWidth: 0,
            }}
          >
            <Icon
              size={nested ? 17 : 19}
              color={isActive ? '#f73582' : '#A39BB3'}
              style={{ flexShrink: 0 }}
            />
            {!isCollapsed && (
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {link.title}
              </span>
            )}
          </div>

          {!isCollapsed && link.badge && (
            <span
              style={{
                fontSize: '0.65rem',
                padding: '0.15rem 0.45rem',
                borderRadius: '6px',
                background: link.badgeColor
                  ? `${link.badgeColor}33`
                  : 'rgba(247, 53, 130, 0.2)',
                color: link.badgeColor || '#f73582',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {link.badge}
            </span>
          )}
        </Link>

        {/* Floating Mini Tooltip */}
        {isCollapsed && hoveredNav === link.href && (
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
                  fontSize: '0.62rem',
                  padding: '1px 5px',
                  borderRadius: '9999px',
                  backgroundColor: link.badgeColor || '#F73582',
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

  // useAuth().logout revokes the refresh token, clears the session and
  // navigates to /login, so there is nothing to chase it with here.
  const handleLogout = () => {
    void logout()
  }

  /*
   * The portal switcher that used to live here is gone. Which portal you are in
   * follows from who you signed in as, so the only way across is to sign out and
   * back in — `accessiblePortals` still guards the routes, it just no longer has
   * a menu in front of it.
   */
  const isStudioRoute =
    pathname?.includes('/templates/') &&
    (pathname?.includes('/edit') ||
      pathname?.includes('/builder') ||
      pathname?.includes('/customize'))

  const isMini = isMiniSidebar || isStudioRoute

  const handleToggleSidebar = () => {
    if (isMobile) {
      setIsMobileDrawerOpen((prev) => !prev)
    } else {
      setIsMiniSidebar((prev) => !prev)
    }
  }

  // Reusable Sidebar Content for both Desktop aside and Mobile Drawer
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
            padding: isCollapsed ? '1.25rem 0.5rem' : '1.25rem 1.25rem',
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
            href="/login"
            onClick={() => isDrawer && setIsMobileDrawerOpen(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
              minWidth: 0,
            }}
          >
            {isCollapsed ? (
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#f73582',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1.15rem',
                  color: '#ffffff',
                }}
              >
                IT
              </div>
            ) : (
              <PortalLogo size="sm" showTagline={true} theme="dark" />
            )}
          </Link>

          {isDrawer ? (
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(false)}
              aria-label="Close drawer"
              className="touch-target"
              style={{
                width: '32px',
                height: '32px',
                flexShrink: 0,
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#DCD3E0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
              }}
            >
              <X size={18} />
            </button>
          ) : (
            !isCollapsed && (
              <button
                type="button"
                onClick={() => setIsMiniSidebar(true)}
                title="Collapse to Mini Sidebar"
                style={{
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
                }}
              >
                <PanelLeftClose size={15} />
              </button>
            )
          )}
        </div>

        {/* Current Active Role Badge */}
        {!isCollapsed && (
          <div
            style={{
              margin: '0.85rem 0.85rem 0.35rem 0.85rem',
              padding: '0.7rem 0.85rem',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: currentRoleDetails.themeColor,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#FCF7FA',
                  }}
                >
                  {currentRoleDetails.title}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#A39BB3' }}>
                  {currentRoleDetails.subtitle}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
              title="Switch portal"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#DCD3E0',
                padding: '4px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <RefreshCw size={13} />
            </button>
          </div>
        )}

        {/* Navigation List */}
        <nav
          style={{
            flex: 1,
            padding: isCollapsed ? '0.75rem 0.45rem' : '0.75rem 0.6rem',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
          >
            {menu.map((entry, index) => {
              // No room for a dropdown in the mini sidebar, so a group lays
              // its pages out as icons, ruled off from the entries around it.
              if (isCollapsed) {
                const links = isSidebarGroup(entry) ? entry.children : [entry]
                return (
                  <div
                    key={entry.title}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem',
                      ...(index > 0
                        ? {
                            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                            paddingTop: '0.35rem',
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
                      gap: '0.75rem',
                      padding: '0.65rem 0.85rem',
                      minHeight: '40px',
                      width: '100%',
                      borderRadius: '10px',
                      color: holdsActive ? '#ffffff' : '#A39BB3',
                      background: 'transparent',
                      border: '1px solid transparent',
                      fontFamily: 'inherit',
                      fontWeight: holdsActive ? 700 : 500,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <GroupIcon
                      size={19}
                      color={holdsActive ? '#f73582' : '#A39BB3'}
                      style={{ flexShrink: 0 }}
                    />
                    <span
                      title={entry.title}
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
                            gap: '0.2rem',
                            margin: '0.15rem 0 0.3rem 1.3rem',
                            paddingLeft: '0.5rem',
                            borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
                          }}
                        >
                          {entry.children.map((link) =>
                            renderLink(link, {
                              isCollapsed: false,
                              nested: true,
                            })
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </nav>

        {/* Sidebar Footer: System Status & User Profile */}
        <div
          style={{
            padding: isCollapsed ? '0.75rem 0.4rem' : '0.85rem 1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.2)',
            flexShrink: 0,
          }}
        >
          {isCollapsed ? (
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
                onClick={() => setIsMiniSidebar(false)}
                title="Expand Sidebar"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#DCD3E0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <PanelLeftOpen size={16} />
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.7rem',
                  color: '#A39BB3',
                  fontWeight: 500,
                  marginBottom: '0.75rem',
                }}
              >
                <ShieldCheck size={13} />
                <span>SOC 2 Type II Certified</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      background: currentRoleDetails.themeColor,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      flexShrink: 0,
                    }}
                  >
                    {user?.name ? user.name.charAt(0) : 'U'}
                  </div>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div
                      title={user?.name || 'Authorised user'}
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#FCF7FA',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                      }}
                    >
                      {user?.name || 'Authorised user'}
                    </div>
                    <div
                      title={user?.organization || 'Print Procurement Portal'}
                      style={{
                        fontSize: '0.68rem',
                        color: '#A39BB3',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                      }}
                    >
                      {user?.organization || 'Print Procurement Portal'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  title="Logout"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#A39BB3',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: '#FAF6F8',
        color: '#2B253E',
      }}
    >
      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
        {/* 1. DESKTOP/TABLET SIDEBAR (VISIBLE ON SCREENS >= 768px) */}
        <aside
          className="saas-desktop-sidebar"
          style={{
            width: isMini ? '72px' : '260px',
            background: '#2B253E',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            transition: 'width 240ms cubic-bezier(0.16, 1, 0.3, 1)',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            zIndex: 30,
            position: 'sticky',
            top: 0,
            height: '100vh',
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          {renderSidebarContent(false)}
        </aside>

        {/* 2. MOBILE SLIDE-OVER DRAWER (VISIBLE ON SCREENS < 768px) */}
        <AnimatePresence>
          {isMobileDrawerOpen && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1200,
                display: 'flex',
              }}
            >
              {/* Frosted Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsMobileDrawerOpen(false)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              />

              {/* Drawer Content */}
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                style={{
                  position: 'relative',
                  width: 'min(85vw, 300px)',
                  height: '100%',
                  backgroundColor: '#2B253E',
                  color: '#ffffff',
                  boxShadow: '10px 0 35px rgba(0, 0, 0, 0.4)',
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

        {/* 3. MAIN APPLICATION CONTENT AREA */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            overflowX: 'clip',
            // A studio is exactly the window: the header, and <main> below it
            // taking what is left. Without a height here <main> grew to fit a
            // long property panel, and the whole page scrolled behind the studio.
            ...(isStudioRoute ? { height: '100vh' } : null),
          }}
        >
          {/* Top SaaS Header Bar */}
          <header
            style={{
              minHeight: '56px',
              background: '#ffffff',
              borderBottom: '1px solid #F0E6EC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 1.25rem',
              position: 'sticky',
              top: 0,
              zIndex: 35,
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            {/* Left: Breadcrumbs / Title */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                minWidth: 0,
                flex: 1,
              }}
            >
              <button
                onClick={handleToggleSidebar}
                title={
                  isMobile
                    ? 'Open Menu'
                    : isMini
                      ? 'Expand Sidebar'
                      : 'Collapse to Mini'
                }
                aria-label={
                  isMobile ? 'Open navigation menu' : 'Toggle sidebar'
                }
                className="touch-target"
                style={{
                  background: '#F5EEF2',
                  border: '1px solid #F0E6EC',
                  borderRadius: '10px',
                  padding: '6px',
                  cursor: 'pointer',
                  color: '#5C566E',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                {isMobile ? (
                  <Menu size={18} />
                ) : isMini ? (
                  <PanelLeftOpen size={18} />
                ) : (
                  <PanelLeftClose size={18} />
                )}
              </button>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.85rem',
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <span
                  className="hide-sm"
                  style={{ color: '#6E6781', fontWeight: 600 }}
                >
                  Print Procurement Portal
                </span>
                <ChevronRight
                  size={14}
                  color="#A39BB3"
                  className="hide-sm"
                  style={{ flexShrink: 0 }}
                />
                <span
                  style={{
                    color: currentRoleDetails.themeColor,
                    fontWeight: 600,
                    background: `${currentRoleDetails.themeColor}15`,
                    padding: '0.2rem 0.55rem',
                    borderRadius: '6px',
                  }}
                >
                  {currentRoleDetails.title} Portal
                </span>
              </div>
            </div>

            {/* Right: Quick Search + Persona Switcher + Status */}
            <div
              className="row-wrap"
              style={{ gap: '0.65rem', justifyContent: 'flex-end' }}
            >
              {/* Delivery Network Status Pill (Hidden on very small screens) */}
              <div
                className="saas-header-status-pill"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.75rem',
                  color: '#059669',
                  fontWeight: 700,
                  background: '#ecfdf5',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '20px',
                  border: '1px solid #a7f3d0',
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: '#10b981',
                  }}
                />
                <span>Active</span>
              </div>

              {/* Persona Switcher Quick Dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  aria-label="Switch portal"
                  className="touch-target"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    background: '#FCF7FA',
                    border: '1px solid #F0E6EC',
                    borderRadius: '10px',
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#3F3852',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={13} color="#6E6781" />
                  <span className="saas-role-btn-text">Portal</span>
                  <ChevronDown size={14} color="#A39BB3" />
                </button>

                <AnimatePresence>
                  {isRoleDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '120%',
                        width: 'min(240px, calc(100vw - 32px))',
                        background: '#ffffff',
                        borderRadius: '14px',
                        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
                        border: '1px solid #F0E6EC',
                        padding: '0.5rem',
                        zIndex: 50,
                      }}
                    >
                      <button
                        onClick={handleLogout}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.65rem',
                          background: 'none',
                          border: 'none',
                          color: '#6E6781',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                        }}
                      >
                        <ExternalLink size={14} />
                        <span>Sign out</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                aria-label="Sign out"
                className="touch-target"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  color: '#b91c1c',
                  borderRadius: '10px',
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <LogOut size={14} />
                <span className="saas-exit-btn-text">Exit</span>
              </button>
            </div>
          </header>

          {/* Main Content Body */}
          <main
            // .page-pad carries the side gutter (24 / 20 / 16) — an inline
            // `padding` shorthand here would zero those sides again, so only
            // paddingBlock is set inline.
            className={isStudioRoute ? undefined : 'page-pad'}
            style={{
              flex: 1,
              paddingBlock: isStudioRoute ? 0 : '24px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: isStudioRoute ? 'hidden' : 'visible',
            }}
          >
            {children}
          </main>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 767px) {
          .saas-desktop-sidebar {
            display: none !important;
          }
          .saas-header-status-pill {
            display: none !important;
          }
          .saas-role-btn-text,
          .saas-exit-btn-text {
            display: none !important;
          }
        }
      `}</style>
    </div>
  )
}
