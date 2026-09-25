/**
 * The browser tab's title, worked out from the route.
 *
 * Next only lets a *server* component export `metadata`, and all 62 screens in
 * this portal are client components — so giving each one a title the official
 * way meant 62 `layout.tsx` files whose entire body was a title and a
 * pass-through. That is a lot of files to keep in step with a menu that
 * already names every page, and renaming a screen meant editing two places.
 *
 * So the title is derived instead: the route is matched against the sidebar
 * menus, which already map an href to the words a user reads for it, and the
 * table below covers what no menu names — sign-in, the checkout steps, and the
 * detail pages that sit under a list.
 *
 * The trade is that the title is set after hydration rather than in the HTML.
 * For a portal that sits entirely behind a login and is never indexed, what
 * matters is the tab a user is looking at, and that is what this sets.
 */
import {
  ADMIN_MENU,
  HEAD_OFFICE_MENU,
  SITE_USER_MENU,
  isSidebarGroup,
  type SidebarLink,
} from '@/components/layout/sidebarMenu'

export const PORTAL_NAME = 'Print Procurement Portal'

/**
 * Screens no sidebar names, matched on the whole path.
 *
 * Exact rather than by prefix, because a list's own href is a prefix of every
 * page under it: matched loosely, `/admin/orders/all` answers to the rule for
 * `/admin/orders/<id>` and every list in the portal is titled "Order details".
 */
const EXACT_TITLES: Readonly<Record<string, string>> = {
  // Signed out
  '/login': 'Sign in',
  '/password/forgot': 'Forgot password',
  '/password/reset': 'Reset password',
  '/invitations/accept': 'Accept invitation',

  // Admin screens that are not menu entries
  '/admin/catalogue/products/import': 'Import products',
  '/admin/catalogue/products/images': 'Product images',
  '/admin/templates/builder': 'Template builder',
  '/admin/settings': 'Settings',
  '/admin/settings/approval-rules': 'Approval rules',

  // Shop
  '/shop/checkout/details': 'Branch and PO reference',
  '/shop/checkout/delivery': 'Delivery and addresses',
  '/shop/checkout/review': 'Review and submit',
  '/shop/orders/history': 'Order history',
  '/shop/po/create': 'Create purchase order',
}

/**
 * A page about one record, named for what it is rather than the list it came
 * from — so two open tabs can be told apart.
 *
 * Only consulted once the exact tables above have had their say, since these
 * patterns cannot tell an id from a word: `/admin/orders/all` looks exactly
 * like `/admin/orders/ord_7` to a regular expression.
 */
const DETAIL_ROUTES: readonly (readonly [RegExp, string])[] = [
  [/\/templates\/[^/]+\/edit$/, 'Edit template'],
  [/\/templates\/customize\/[^/]+$/, 'Personalise design'],
  [/\/order-confirmation\/[^/]+$/, 'Order confirmed'],
  [/\/orders\/[^/]+$/, 'Order details'],
  [/\/catalogue\/products\/[^/]+$/, 'Product details'],
  [/\/shop\/catalogue\/[^/]+$/, 'Product'],
  [/\/monthly-billing\/[^/]+$/, 'Invoice'],
  [/\/billing\/monthly\/[^/]+$/, 'Billing period'],
]

/** Every menu link from all three portals, longest href first. */
const MENU_LINKS: readonly SidebarLink[] = [
  ...ADMIN_MENU,
  ...HEAD_OFFICE_MENU,
  ...SITE_USER_MENU,
]
  .flatMap((entry) => (isSidebarGroup(entry) ? [...entry.children] : [entry]))
  .sort((a, b) => b.href.length - a.href.length)

/**
 * What this route is called, or null when nothing names it — in which case the
 * tab keeps the portal's own name rather than inventing one from the URL.
 *
 * Exact answers first, then the record pages, then the menus. That order is
 * the whole trick: every other arrangement lets a pattern for a detail page
 * swallow the list above it.
 */
export function titleForPath(pathname: string | null): string | null {
  if (!pathname) return null
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  const exact = EXACT_TITLES[path]
  if (exact) return exact

  const menuExact = MENU_LINKS.find((link) => link.href === path)
  if (menuExact) return menuExact.title

  for (const [pattern, title] of DETAIL_ROUTES) {
    if (pattern.test(path)) return title
  }

  // Anything deeper than a menu link belongs to it — a tab in a settings
  // screen, a sub-route nobody named.
  for (const link of MENU_LINKS) {
    if (path.startsWith(`${link.href}/`)) return link.title
  }
  return null
}

/** The whole tab title: "Cart · Print Procurement Portal". */
export function documentTitleFor(pathname: string | null): string {
  const title = titleForPath(pathname)
  return title ? `${title} · ${PORTAL_NAME}` : PORTAL_NAME
}
