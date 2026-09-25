'use client'

import React from 'react'
import Link from 'next/link'
import {
  ShieldCheck,
  FileSpreadsheet,
  Store,
  Building2,
  Shield,
  Lock,
} from 'lucide-react'
import { Container } from './Container'

import { PortalLogo } from '../ui/PortalLogo'

export const Footer: React.FC = () => {
  return (
    <footer
      style={{
        background: 'var(--color-secondary)',
        color: '#ffffff',
        paddingTop: '3.5rem',
        paddingBottom: '4.5rem', // space for mobile nav
        marginTop: '5rem',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <Container>
        {/* Enterprise Value Props Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.5rem',
            paddingBottom: '2.5rem',
            marginBottom: '2.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'rgba(247, 53, 130, 0.15)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)' }}>
                Brand-Approved DAM Assets
              </div>
              <div
                style={{ fontSize: 'var(--font-size-xs)', color: '#a6a0b8' }}
              >
                100% compliant marketing collateral
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'rgba(37, 99, 235, 0.15)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)' }}>
                Consolidated Multi-Site Billing
              </div>
              <div
                style={{ fontSize: 'var(--font-size-xs)', color: '#a6a0b8' }}
              >
                Single monthly roll-up invoicing
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'rgba(88, 185, 125, 0.15)',
                color: '#58b97d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Lock size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 'var(--font-size-md)' }}>
                SOC-2 & Audit Certified
              </div>
              <div
                style={{ fontSize: 'var(--font-size-xs)', color: '#a6a0b8' }}
              >
                Role-based enterprise security
              </div>
            </div>
          </div>
        </div>

        {/* Main Footer Links */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '2.5rem',
            paddingBottom: '2.5rem',
          }}
        >
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <PortalLogo size="sm" showTagline={true} theme="dark" />
            </div>
            <p
              style={{
                color: '#a6a0b8',
                fontSize: 'var(--font-size-sm)',
                lineHeight: 1.6,
              }}
            >
              Enterprise digital asset management, store collateral self-service
              ordering, and automated multi-site consolidated billing platform.
            </p>
          </div>

          <div>
            <div
              style={{
                fontWeight: 700,
                marginBottom: '1rem',
                color: '#ffffff',
                fontSize: 'var(--font-size-sm)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Portals
            </div>
            <ul
              style={{
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                fontSize: 'var(--font-size-sm)',
                color: '#a6a0b8',
              }}
            >
              <li>
                <Link
                  href="/shop/catalogue"
                  style={{
                    transition: 'color 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Store size={14} color="#f73582" />
                  <span>Site User (Branch Orders)</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/head-office"
                  style={{
                    transition: 'color 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Building2 size={14} color="#60a5fa" />
                  <span>Head Office (Consolidated Billing)</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/admin"
                  style={{
                    transition: 'color 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Shield size={14} color="#58b97d" />
                  <span>Admin (Full Operations HQ)</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  style={{
                    transition: 'color 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Lock size={14} color="#38bdf8" />
                  <span>Login & Role Switcher</span>
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div
              style={{
                fontWeight: 700,
                marginBottom: '1rem',
                color: '#ffffff',
                fontSize: 'var(--font-size-sm)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Collateral Categories
            </div>
            <ul
              style={{
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                fontSize: 'var(--font-size-sm)',
                color: '#a6a0b8',
              }}
            >
              <li>
                <span>Point of Sale Displays</span>
              </li>
              <li>
                <span>Digital & Signage Assets</span>
              </li>
              <li>
                <span>Staff Uniforms & Apparel</span>
              </li>
              <li>
                <span>Print Collateral & Lookbooks</span>
              </li>
              <li>
                <span>VIP Branded Merchandise</span>
              </li>
            </ul>
          </div>

          <div>
            <div
              style={{
                fontWeight: 700,
                marginBottom: '1rem',
                color: '#ffffff',
                fontSize: 'var(--font-size-sm)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Compliance & Security
            </div>
            <p
              style={{
                color: '#a6a0b8',
                fontSize: 'var(--font-size-xs)',
                marginBottom: '0.8rem',
                lineHeight: 1.5,
              }}
            >
              All marketing collateral assets, PO authorization thresholds, and
              consolidated billing exports comply with enterprise SOC-2 Type II
              standards.
            </p>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'rgba(88, 185, 125, 0.12)',
                border: '1px solid rgba(88, 185, 125, 0.3)',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                color: '#58b97d',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={16} />
              <span>SOC-2 & ISO-27001 Certified</span>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: '1.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            fontSize: 'var(--font-size-xs)',
            color: '#8b8599',
          }}
        >
          <div>© 2026 Print Procurement Portal. All rights reserved.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span>Privacy Policy</span>
            <span>•</span>
            <span>Terms of Service</span>
            <span>•</span>
            <span>Audit Logs</span>
          </div>
        </div>
      </Container>
    </footer>
  )
}
