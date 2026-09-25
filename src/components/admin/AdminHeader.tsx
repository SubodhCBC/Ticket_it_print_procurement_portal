// src/components/admin/AdminHeader.tsx
'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  LogOut,
  ChevronDown,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSidebar } from '@/hooks/useSidebar'

export function AdminHeader({
  title,
  subtitle,
  actionButton,
}: {
  title: string
  subtitle?: string
  actionButton?: React.ReactNode
}) {
  const { user, logout, hasPermission } = useAuth()
  // /admin/settings is backed by an ACCOUNT_MANAGE (admin-only) API.
  const canOpenSettings = hasPermission('ACCOUNT_MANAGE')
  const sidebar = useSidebar()
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const handleSidebarToggle = () => {
    if (sidebar.isMobile) {
      sidebar.toggleMobileDrawer()
    } else {
      sidebar.toggleMiniSidebar()
    }
  }

  return (
    <header
      style={{
        minHeight: '70px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #F0E6EC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1.25rem',
        position: 'sticky',
        top: 0,
        zIndex: 35,
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      {/* Left: Sidebar Toggle + Title & Subtitle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minWidth: 0,
          flex: 1,
        }}
      >
        {/* Responsive Toggle Button */}
        <button
          type="button"
          onClick={handleSidebarToggle}
          aria-label="Toggle Sidebar Navigation"
          title={
            sidebar.isMobile
              ? 'Open Navigation Menu'
              : sidebar.isMiniSidebar
                ? 'Expand Sidebar'
                : 'Collapse to Mini Sidebar'
          }
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            backgroundColor: '#FCF7FA',
            border: '1px solid #F0E6EC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2B253E',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all 150ms ease',
          }}
        >
          {sidebar.isMobile ? (
            <Menu size={19} />
          ) : sidebar.isMiniSidebar ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>

        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
              margin: 0,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              style={{
                fontSize: '0.74rem',
                color: '#6E6781',
                margin: 0,
                marginTop: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexShrink: 0,
        }}
      >
        {/* Optional Action Button */}
        {actionButton && (
          <div
            className="admin-header-action-btn"
            style={{ display: 'flex', alignItems: 'center' }}
          >
            {actionButton}
          </div>
        )}

        {/* Notification Bell */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: '#FCF7FA',
              border: '1px solid #F0E6EC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5C566E',
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            <Bell size={18} />
            <span
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                width: '7px',
                height: '7px',
                backgroundColor: '#F73582',
                borderRadius: '50%',
              }}
            />
          </button>

          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: 0,
                width: '290px',
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
                border: '1px solid #F0E6EC',
                padding: '14px',
                zIndex: 50,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  color: '#2B253E',
                  marginBottom: '8px',
                }}
              >
                Recent Alerts
              </div>
              <div
                style={{
                  fontSize: '0.76rem',
                  color: '#6E6781',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    padding: '8px',
                    backgroundColor: '#FFF0F6',
                    borderRadius: '6px',
                    color: '#B01654',
                  }}
                >
                  <strong>New Collateral Order:</strong> ORD-2026-8819 ($630.00)
                </div>
                <div
                  style={{
                    padding: '8px',
                    backgroundColor: '#EAF8EF',
                    borderRadius: '6px',
                    color: '#228B53',
                  }}
                >
                  <strong>Fulfilment Dispatched:</strong> Carrier assigned &
                  tracking live.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 10px 5px 5px',
              borderRadius: '9999px',
              backgroundColor: '#FCF7FA',
              border: '1px solid #F0E6EC',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                backgroundColor: '#2B253E',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.82rem',
              }}
            >
              {user?.name ? user.name[0] : 'A'}
            </div>
            <div
              className="admin-header-user-info"
              style={{ textAlign: 'left', lineHeight: 1.1 }}
            >
              <div
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#2B253E',
                }}
              >
                {user?.name || 'Administrator'}
              </div>
              <div
                style={{
                  fontSize: '0.66rem',
                  color: '#F73582',
                  fontWeight: 600,
                }}
              >
                Operations HQ Admin
              </div>
            </div>
            <ChevronDown size={14} color="#6E6781" />
          </button>

          {showProfileMenu && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: 0,
                width: '210px',
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
                border: '1px solid #F0E6EC',
                padding: '8px',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid #F5EEF2',
                }}
              >
                <div style={{ fontSize: '0.72rem', color: '#6E6781' }}>
                  Signed in as
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    wordBreak: 'break-all',
                  }}
                >
                  {user?.email || 'sarah.jenkins@ticketit.com'}
                </div>
              </div>
              {canOpenSettings && (
                <Link
                  href="/admin/settings"
                  onClick={() => setShowProfileMenu(false)}
                  style={{
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    color: '#5C566E',
                    borderRadius: '6px',
                    textDecoration: 'none',
                  }}
                >
                  Settings
                </Link>
              )}
              <button
                type="button"
                // logout() revokes the refresh token and navigates to /login.
                onClick={() => void logout()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  color: '#EF4444',
                  borderRadius: '6px',
                  fontWeight: 600,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <LogOut size={14} />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 640px) {
          .admin-header-user-info {
            display: none;
          }
        }
      `}</style>
    </header>
  )
}
