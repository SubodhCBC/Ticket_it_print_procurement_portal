import { redirect } from 'next/navigation'

export default function GeneralSettingsRedirectPage() {
  redirect('/admin/settings?tab=general')
}
