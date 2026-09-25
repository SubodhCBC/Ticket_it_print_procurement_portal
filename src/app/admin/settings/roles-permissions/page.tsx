import { redirect } from 'next/navigation'

export default function RolesPermissionsRedirectPage() {
  redirect('/admin/settings?tab=roles')
}
