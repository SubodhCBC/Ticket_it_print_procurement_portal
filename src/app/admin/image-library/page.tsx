// src/app/admin/image-library/page.tsx
'use client'

import { AdminHeader } from '@/components/admin/AdminHeader'
import { DamLibrary } from '@/components/dam/DamLibrary'

/**
 * The image library for admins and head office (the admin layout lets both
 * in). Upload is offered by the library itself, only to roles with
 * DAM_UPLOAD and a live Ticket-IT session.
 */
export default function AdminImageLibraryPage() {
  return (
    <>
      <AdminHeader
        title="Image Library"
        subtitle="Browse, upload and share the pictures and PDFs held in your Ticket-IT library."
      />

      <main
        style={{
          // Narrower gutters on a phone; 24px like the other admin screens
          // once there is room.
          padding: 'clamp(12px, 4vw, 24px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          minWidth: 0,
        }}
      >
        <section
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #F0E6EC',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            padding: 'clamp(12px, 3vw, 20px)',
            minWidth: 0,
          }}
        >
          <DamLibrary mode="manage" />
        </section>
      </main>
    </>
  )
}
