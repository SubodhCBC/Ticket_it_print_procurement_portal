import { redirect } from 'next/navigation'

/**
 * The integrations entry point. The settings tab it used to open no longer
 * exists; the one integration with a status screen is NZ Post, which lives
 * with the shipping operations it serves.
 */
export default function IntegrationsRedirectPage() {
  redirect('/admin/orders/shipping')
}
