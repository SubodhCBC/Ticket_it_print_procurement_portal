import { redirect } from 'next/navigation'

export default function CustomerUsersRedirectPage() {
  redirect('/admin/customers/accounts?tab=users')
}
