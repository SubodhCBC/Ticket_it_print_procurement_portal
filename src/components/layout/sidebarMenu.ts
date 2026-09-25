// src/components/layout/sidebarMenu.ts
import { useState } from 'react'
import {
  BadgePercent,
  Boxes,
  Building2,
  ChartColumn,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  Gavel,
  History,
  Hourglass,
  Images,
  Kanban,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  Package,
  PackageCheck,
  Palette,
  Percent,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'

/**
 * The portals' sidebar menus, and what every sidebar needs to know about them:
 * which link the current route belongs to, and which groups are open.
 *
 * A top-level entry is either a link or a group. A group has no page of its
 * own — clicking it opens the links beneath it.
 *
 * All three menus live here rather than inside their sidebars because an
 * administrator can walk into the shop and head-office portals too, and those
 * render through a different layout. The two copies of the admin menu that
 * implied had already drifted apart — "Master Templates" in one, "Design
 * Templates" in the other, and no Categories, Fulfilment Queue or Settings in
 * the second at all.
 */

export interface SidebarLink {
  title: string
  href: string
  icon: LucideIcon
  badge?: string
  badgeColor?: string
  /**
   * Routes that belong to this link without sitting under its href: an order's
   * detail page belongs to the order list, checkout belongs to the cart.
   */
  match?: readonly string[]
}

export interface SidebarGroup {
  title: string
  icon: LucideIcon
  children: readonly SidebarLink[]
}

export type SidebarEntry = SidebarLink | SidebarGroup

export function isSidebarGroup(entry: SidebarEntry): entry is SidebarGroup {
  return 'children' in entry
}

export const ADMIN_MENU: readonly SidebarEntry[] = [
  { title: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  {
    title: 'Catalogue & Templates',
    icon: Library,
    children: [
      {
        title: 'Design Templates',
        href: '/admin/templates',
        icon: LayoutTemplate,
        badge: 'Master',
      },
      {
        title: 'Template Builder',
        href: '/admin/templates/builder',
        icon: Palette,
      },
      {
        title: 'Print Products',
        href: '/admin/catalogue/products',
        icon: Package,
      },
      {
        title: 'Categories',
        href: '/admin/catalogue/categories',
        icon: Layers,
      },
      {
        title: 'Inventory Count',
        href: '/admin/catalogue/inventory',
        icon: Boxes,
      },
      {
        title: 'Image Library',
        href: '/admin/image-library',
        icon: Images,
      },
    ],
  },
  {
    title: 'Customers & Sites',
    icon: Users,
    children: [
      {
        title: 'Accounts',
        href: '/admin/customers/accounts',
        icon: Building2,
        match: ['/admin/customers'],
      },
      {
        title: 'Approval Rules',
        href: '/admin/settings/approval-rules',
        icon: ClipboardCheck,
      },
    ],
  },
  {
    title: 'Pricing & Contracts',
    icon: BadgePercent,
    children: [
      { title: 'Rate Cards', href: '/admin/pricing/rate-cards', icon: Percent },
    ],
  },
  {
    title: 'Orders & Logistics',
    icon: Truck,
    children: [
      {
        title: 'All Orders',
        href: '/admin/orders/all',
        icon: ShoppingCart,
        badge: 'Live',
        match: ['/admin/orders'],
      },
      {
        title: 'Approvals',
        href: '/admin/orders/approvals',
        icon: CheckCircle2,
      },
      {
        title: 'Fulfilment Queue',
        href: '/admin/orders/fulfilment',
        icon: Kanban,
      },
      {
        title: 'Shipping & Pickups',
        href: '/admin/orders/shipping',
        icon: PackageCheck,
      },
    ],
  },
  {
    title: 'Reporting & Compliance',
    icon: ChartColumn,
    children: [
      {
        title: 'Monthly Billing',
        href: '/admin/reports/monthly-billing',
        icon: FileSpreadsheet,
      },
      {
        title: 'Analytics & Exports',
        href: '/admin/reports/analytics',
        icon: TrendingUp,
      },
      {
        title: 'Approval Activity',
        href: '/admin/reports/approval-activity',
        icon: Gavel,
      },
      {
        title: 'Order Ageing',
        href: '/admin/reports/order-ageing',
        icon: Hourglass,
      },
      {
        title: 'User Access Review',
        href: '/admin/reports/access-review',
        icon: UserCheck,
      },
      {
        title: 'Audit Log',
        href: '/admin/reports/audit-log',
        icon: History,
      },
    ],
  },
  {
    title: 'Settings',
    href: '/admin/settings',
    icon: Settings,
    match: ['/admin/integrations'],
  },
]

export const HEAD_OFFICE_MENU: readonly SidebarEntry[] = [
  {
    title: 'HQ Dashboard',
    href: '/head-office/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Catalogue & Templates',
    icon: Library,
    children: [
      { title: 'Templates', href: '/head-office/templates', icon: Layers },
      {
        title: 'Read-Only Catalogue',
        href: '/head-office/catalogue',
        icon: Package,
      },
      {
        title: 'Image Library',
        href: '/head-office/image-library',
        icon: Images,
      },
    ],
  },
  {
    title: 'Orders & Approvals',
    icon: ClipboardCheck,
    children: [
      {
        title: 'Cross-Site Orders',
        href: '/head-office/orders/all',
        icon: ShoppingCart,
        badge: 'Live',
        match: ['/head-office/orders'],
      },
      {
        title: 'PO Approvals & Payments',
        href: '/head-office/approvals',
        icon: CheckCircle2,
        badge: 'Action',
        badgeColor: '#059669',
      },
    ],
  },
  {
    title: 'Billing & Reports',
    icon: ChartColumn,
    children: [
      {
        title: 'Monthly Billing',
        href: '/head-office/billing/monthly',
        icon: FileSpreadsheet,
        badge: 'Reports',
      },
      {
        title: 'Spend Insights',
        href: '/head-office/reports/spend-by-site',
        icon: TrendingUp,
      },
      {
        title: 'Analytics & Exports',
        href: '/head-office/reports/analytics',
        icon: ChartColumn,
      },
      {
        title: 'Approval Activity',
        href: '/head-office/reports/approval-activity',
        icon: Gavel,
      },
      {
        title: 'Order Ageing',
        href: '/head-office/reports/order-ageing',
        icon: Hourglass,
      },
      {
        title: 'User Access Review',
        href: '/head-office/reports/access-review',
        icon: UserCheck,
      },
    ],
  },
]

export const SITE_USER_MENU: readonly SidebarEntry[] = [
  {
    title: 'Catalogue & Templates',
    icon: Library,
    children: [
      {
        title: 'Template Gallery',
        href: '/shop/templates',
        icon: FileSpreadsheet,
      },
      {
        title: 'Print Products Catalogue',
        href: '/shop/catalogue',
        icon: Package,
      },
    ],
  },
  {
    title: 'Orders',
    icon: Truck,
    children: [
      {
        title: 'Purchase Orders & Pipeline',
        href: '/shop/orders',
        icon: ClipboardList,
        badge: 'Live',
        match: ['/shop/order-confirmation', '/shop/po'],
      },
      {
        title: 'Order History',
        href: '/shop/orders/history',
        icon: History,
      },
    ],
  },
  {
    title: 'Reports',
    icon: ChartColumn,
    children: [
      {
        title: 'Reports & Exports',
        href: '/shop/reports/analytics',
        icon: ChartColumn,
      },
      {
        title: 'Open Orders',
        href: '/shop/reports/order-ageing',
        icon: Clock,
      },
    ],
  },
  {
    title: 'Collateral Cart',
    href: '/shop/cart',
    icon: ShoppingCart,
    match: ['/shop/checkout'],
  },
]

/**
 * The one link the current route belongs to.
 *
 * The longest match wins rather than the first: `/admin/templates` is a prefix
 * of `/admin/templates/builder`, and a prefix test on its own lit both entries
 * on the builder page.
 */
export function findActiveHref(
  pathname: string,
  entries: readonly SidebarEntry[]
): string | null {
  let activeHref: string | null = null
  let longest = 0

  for (const entry of entries) {
    for (const link of isSidebarGroup(entry) ? entry.children : [entry]) {
      for (const pattern of [link.href, ...(link.match ?? [])]) {
        const matches =
          pathname === pattern || pathname.startsWith(`${pattern}/`)
        if (matches && pattern.length > longest) {
          longest = pattern.length
          activeHref = link.href
        }
      }
    }
  }

  return activeHref
}

/**
 * Which groups are open.
 *
 * A group opens by itself when the route moves into it — following a "View all"
 * link into a group the user had closed should not leave the page's own entry
 * hidden — and otherwise stays the way the user left it.
 */
export function useOpenGroups(
  entries: readonly SidebarEntry[],
  activeHref: string | null
) {
  const activeGroup =
    entries.find(
      (entry) =>
        isSidebarGroup(entry) &&
        entry.children.some((link) => link.href === activeHref)
    )?.title ?? null

  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    activeGroup ? { [activeGroup]: true } : {}
  )
  const [openedFor, setOpenedFor] = useState(activeGroup)

  // Adjusted during render rather than in an effect, so the group is already
  // open on the render that first shows the new page.
  if (activeGroup !== openedFor) {
    setOpenedFor(activeGroup)
    if (activeGroup) setOpen((prev) => ({ ...prev, [activeGroup]: true }))
  }

  return {
    isOpen: (title: string) => open[title] === true,
    toggle: (title: string) =>
      setOpen((prev) => ({ ...prev, [title]: !prev[title] })),
  }
}
