import { redirect } from 'next/navigation'

export default function RequiredFieldsRedirectPage() {
  redirect('/admin/settings?tab=po-validation')
}
