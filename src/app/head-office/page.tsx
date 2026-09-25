// src/app/head-office/page.tsx
// Root /head-office redirect to the dashboard
import { redirect } from 'next/navigation'

export default function HeadOfficePage() {
  redirect('/head-office/dashboard')
}
