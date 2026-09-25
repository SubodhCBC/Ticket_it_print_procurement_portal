import { redirect } from 'next/navigation'

export default function CustomerSitesRedirectPage() {
  redirect('/admin/customers/accounts?tab=sites')
}
