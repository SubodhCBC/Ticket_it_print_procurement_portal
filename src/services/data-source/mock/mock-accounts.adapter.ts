// src/lib/data-source/mock/mock-accounts.adapter.ts
import initialAccounts from './fixtures/accounts.json'
import initialSites from './fixtures/sites.json'
import type {
  Account,
  Site,
  PortalUser,
  PaginatedResult,
  Address,
  AccountOrderRules,
} from '@/types'
import { simulateLatency, paginate } from './utils'

let accountsStore: Account[] = [...(initialAccounts as Account[])]
let sitesStore: Site[] = [...(initialSites as Site[])]
let usersStore: PortalUser[] = [
  {
    id: 'usr_admin_999',
    email: 'admin@rahhawan.io',
    name: 'Dr. Sarah Sterling',
    role: 'ADMIN',
    avatar:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    department: 'Platform Operations & Compliance',
    status: 'ACTIVE',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'usr_site_104',
    email: 'pharmacy@rahhawan.io',
    name: 'Marcus Vance, PharmD',
    role: 'SITE_USER',
    avatar:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    siteId: 'site-104',
    siteCode: 'PHARM-NYC-104',
    siteName: 'Downtown Dispensing Hub #104',
    accountId: 'acc-002',
    accountName: 'Metro Dispensaries Network',
    department: 'Pharmacy Operations',
    poPrefix: 'RX-APX104',
    monthlyBudgetCap: 15000,
    status: 'ACTIVE',
    createdAt: '2026-01-12T10:00:00.000Z',
  },
  {
    id: 'usr_driver_001',
    email: 'driver@rahhawan.io',
    name: 'Elena Rostova',
    role: 'HEAD_OFFICE',
    avatar:
      'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    department: 'Regional Dispatch & Courier Fleet',
    poPrefix: 'PO-FLEET-EXP',
    status: 'ACTIVE',
    createdAt: '2026-02-01T09:00:00.000Z',
  },
  {
    id: 'usr_site_101',
    email: 'smiller@apexhealth.org',
    name: 'Dr. Sarah Miller',
    role: 'SITE_USER',
    avatar:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    siteId: 'site-101',
    siteCode: 'APX-MID-101',
    siteName: 'Apex Midtown Central Pharmacy',
    accountId: 'acc-001',
    accountName: 'Apex Healthcare Group',
    department: 'Dispensing & Infusion',
    poPrefix: 'PO-APX',
    monthlyBudgetCap: 20000,
    status: 'ACTIVE',
    createdAt: '2025-10-10T11:00:00.000Z',
  },
]

export async function listAccounts(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: Account['status']
}): Promise<PaginatedResult<Account>> {
  await simulateLatency()
  let results = [...accountsStore]

  if (params?.status) {
    results = results.filter((a) => a.status === params.status)
  }

  if (params?.search) {
    const q = params.search.toLowerCase()
    results = results.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.accountCode.toLowerCase().includes(q) ||
        a.contactEmail.toLowerCase().includes(q)
    )
  }

  return paginate(results, params?.page ?? 1, params?.pageSize ?? 20)
}

export async function getAccountById(id: string): Promise<Account | null> {
  await simulateLatency()
  return accountsStore.find((a) => a.id === id || a.accountCode === id) ?? null
}

export async function createAccount(
  input: Omit<Account, 'id'>
): Promise<Account> {
  await simulateLatency()
  const newAccount: Account = {
    ...input,
    id: `acc-${Date.now()}`,
    sitesCount: 0,
    totalMonthlySpend: 0,
    createdAt: new Date().toISOString(),
  }
  accountsStore.unshift(newAccount)
  return { ...newAccount }
}

export async function listSites(params?: {
  accountId?: string
  search?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<Site>> {
  await simulateLatency()
  let results = [...sitesStore]

  if (params?.accountId) {
    results = results.filter((s) => s.accountId === params.accountId)
  }

  if (params?.search) {
    const q = params.search.toLowerCase()
    results = results.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.accountName && s.accountName.toLowerCase().includes(q))
    )
  }

  return paginate(results, params?.page ?? 1, params?.pageSize ?? 20)
}

export async function getSiteById(id: string): Promise<Site | null> {
  await simulateLatency()
  return sitesStore.find((s) => s.id === id || s.code === id) ?? null
}

export async function createSite(input: Omit<Site, 'id'>): Promise<Site> {
  await simulateLatency()
  const newSite: Site = {
    ...input,
    id: `site-${Date.now()}`,
    activeUsersCount: 1,
    totalOrdersCount: 0,
    monthlySpend: 0,
    createdAt: new Date().toISOString(),
  }
  sitesStore.push(newSite)

  // Update account site count
  const acc = accountsStore.find((a) => a.id === input.accountId)
  if (acc) {
    acc.sitesCount = (acc.sitesCount || 0) + 1
  }

  return { ...newSite }
}

export async function listUsers(params?: {
  role?: PortalUser['role']
  siteId?: string
  accountId?: string
  search?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<PortalUser>> {
  await simulateLatency()
  let results = [...usersStore]

  if (params?.role) {
    results = results.filter((u) => u.role === params.role)
  }
  if (params?.siteId) {
    results = results.filter((u) => u.siteId === params.siteId)
  }
  if (params?.accountId) {
    results = results.filter((u) => u.accountId === params.accountId)
  }
  if (params?.search) {
    const q = params.search.toLowerCase()
    results = results.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.department && u.department.toLowerCase().includes(q))
    )
  }

  return paginate(results, params?.page ?? 1, params?.pageSize ?? 20)
}

export async function createUser(
  input: Omit<PortalUser, 'id' | 'createdAt'>
): Promise<PortalUser> {
  await simulateLatency()
  const newUser: PortalUser = {
    ...input,
    id: `usr_${Date.now()}`,
    createdAt: new Date().toISOString(),
  }
  usersStore.unshift(newUser)
  return { ...newUser }
}

export async function getOrderRules(
  accountId: string
): Promise<AccountOrderRules> {
  await simulateLatency(30)
  const account = accountsStore.find((a) => a.id === accountId)
  const accountName = account?.name || 'Customer Account'

  // Configured business rules per account:
  // Apex Healthcare (acc-001): Mandatory PO (PO-APX-*), Restricted to saved addresses by default
  // Metro Dispensaries (acc-002): Mandatory PO (RX-MET-*), Allows custom address entry
  // Beacon (acc-003): Optional PO, Restricted to saved addresses
  // Default: Optional PO, Allowed custom address
  if (accountId === 'acc-001') {
    return {
      accountId,
      accountName,
      requirePoNumber: true,
      poPrefix: 'PO-APX',
      approvalThreshold: 25000,
      requireDeliveryNotes: false,
      defaultCarrier: 'Rahhawan Direct Logistics',
    }
  } else if (accountId === 'acc-002') {
    return {
      accountId,
      accountName,
      requirePoNumber: true,
      poPrefix: 'PO-METRO',
      approvalThreshold: 15000,
      requireDeliveryNotes: false,
      defaultCarrier: 'FedEx Priority',
    }
  }

  return {
    accountId,
    accountName,
    requirePoNumber: false,
    poPrefix: 'PO-REF',
    approvalThreshold: 10000,
    requireDeliveryNotes: false,
    defaultCarrier: 'Standard Carrier',
  }
}

export async function getSiteAddresses(siteId: string): Promise<{
  siteId: string
  siteName: string
  siteCode: string
  billToAddress: Address
  shipToAddress: Address
} | null> {
  await simulateLatency(30)
  const site = sitesStore.find((s) => s.id === siteId || s.code === siteId)
  if (!site) return null
  return {
    siteId: site.id,
    siteName: site.name,
    siteCode: site.code,
    billToAddress: site.billToAddress,
    shipToAddress: site.shipToAddress,
  }
}
