# Print Procurement Portal — front end

Next.js 16 (App Router, Turbopack) front end for the Print Procurement Portal. It is a pure client of the NestJS API in `print_procurement_portal`;
it holds no database and no server-side data access of its own.

Three portals share one application shell, chosen by the role the API issues:

| Portal      | Route prefix   | Role          |
| ----------- | -------------- | ------------- |
| Admin       | `/admin`       | `ADMIN`       |
| Head Office | `/head-office` | `HEAD_OFFICE` |
| Shop        | `/shop`        | `SITE_USER`   |

## Running it

[SETUP.md](SETUP.md) has the whole of it — services, `.env`, migrations, seed,
and moving data between machines. In short, with Docker running:

```bash
docker compose -f docker/docker-compose.yml up -d
cp .env.example .env
npm ci
npm run db:deploy    # never db:migrate; SETUP.md says why
npm run db:seed
npm run dev          # http://localhost:3000
npm run worker:dev   # in a second terminal
```

Next reads `.env` once at startup, so a change to it needs a dev-server restart.

Sign in with the seeded development users — `dev.admin`, `dev.headoffice` or
`dev.siteuser`, password `Password123!`. The field is a **username**, not an
email address: `Users.Email` is not unique in the legacy Ticket-IT database, so
the API authenticates on `Users.Login`.

## How data reaches a screen

```
screen -> hooks/use*.ts (TanStack Query) -> services/*.service.ts -> data-source -> adapter -> API
```

Every read goes through TanStack Query, configured in
`lib/query/QueryProvider.tsx`. Two things that matters for:

- **Deduplication.** Two components asking the same question share one request.
  Before this, the admin dashboard cost sixteen requests for seven distinct
  answers, and the same order page was fetched twice by two different hooks.
- **Caching.** A 30-second default stale window collapses the burst of a page
  load; reports and the customer directory sit longer (60s and 2min), the
  fulfilment board and approvals queue shorter (10s), and the cart is never
  cached at all.

Query keys live in one place (`queryKeys`) because deduplication is by key —
two screens spelling the same question differently would not share anything.
Mutations invalidate by prefix rather than patching cached rows: a status change
moves an order between queues, alters the approvals list and changes what
billing will pick up, and a surgical cache edit would have to know all of that.

`retry` deliberately skips 4xx. A 403 is an answer, not a failure, and retrying
it three times turns one refusal into four.

`services/data-source/index.ts` is the seam. Each domain points at either an
API adapter or a fixture-backed mock adapter, and they share a signature, so a
screen never learns which side it is talking to. Modules move across one at a
time.

| Domain                    | Source                                           |
| ------------------------- | ------------------------------------------------ |
| Auth                      | API (`/auth/*`, through the Redux store)         |
| Catalogue                 | API (`/catalog/products`, `/catalog/categories`) |
| Pricing and rate cards    | API (`/pricing/*`)                               |
| Accounts, sites and users | API (`/accounts`, `/sites`, `/users`)            |
| Cart and checkout         | API (`/cart/*`, through the Redux store)         |
| Orders and approvals      | API (`/orders/*`)                                |
| Reports                   | API (`/reports/*`)                               |
| Consolidated billing      | API (`/billing/*`)                               |
| Audit log                 | API (`/audit-logs`, read-only)                   |
| Roles and permissions     | API (`/authorization/permissions`, read-only)    |
| Templates                 | **no backend module exists yet**                 |

Templates is the one domain still on fixtures, and not because it is waiting
its turn: there is no `modules/templates` in the API and no Template model in
the schema, so the builder, gallery and customiser are a front-end-only feature
with nothing behind them.

`/shop/po/create` — ordering a personalised template — belongs to that gap and
now **refuses with an explanation**. It used to assemble an order in the browser
and post it, which against this API placed whatever was in the buyer's basket
under the reference shown on screen, at prices the page had invented. The proper
route exists (a cart line carries `customisation`, which the API snapshots onto
the order line for production) and needs only the template to be a real record.

`services/data-source/api/product.mapper.ts` is the only file that knows both
the API's catalogue shape and the UI's `Product`. Screens keep reading the UI
type, so a field added to the API surfaces in one place rather than thirty.

Nothing in `services/*.service.ts` writes an audit entry. The API records one
against the authenticated actor for every mutation; a client-side copy would
have to invent an actor and would put a fictional entry beside the real one.

### Pricing

Prices are never computed in the browser. `POST /pricing/quote` is the single
authority, and it arbitrates five rules in order — contract fixed price, then
the contract's volume ladder, then a per-product contract discount, then the
card's blanket discount, then the catalogue's own ladder. Every quoted line
reports which rule produced it, because "20% off" reached by a negotiated
ladder and by a blanket discount are the same number and a very different
conversation with the customer.

The shop grid quotes a whole page in one batched call rather than once per
tile. A rate-card list returns `itemCount` and no lines — a card may carry two
thousand negotiated products — so the admin screen loads a card's terms when
someone opens it.

### The basket

The cart lives on the server, not in the browser. `store/cartSlice.ts` is a
cache of `/cart`: every mutation is a request and the response replaces the
state, because only the server knows the rate card, the stock and the branch's
budget. A basket now survives a reload and follows the buyer between devices.

A bare cart read carries **no prices**. `POST /cart/validate` is what prices a
basket, and it also reports the MOQ adjustments, the purchase-order check and
the budget position — so the cart page renders the server's numbers rather than
arithmetic of its own. The 10% GST the page used to display was invented; the
API does not model tax, so none is shown.

Two rules the UI has to honour, both enforced server-side:

- **A product with option axes can only be ordered as one of its variants.** The
  product page picks a configuration and sends its `variantId`; a grid tile
  cannot, so it links to the product page instead.
- **Quantities are reported, not silently rounded.** A quantity below the MOQ
  comes back as a warning with the corrected number attached, and the buyer
  accepts it (`POST /cart/normalise`) rather than finding it on the invoice.

Checkout writes its steps to the basket (`PATCH /cart/checkout-details`) as the
buyer moves through them, and placement posts nothing but the recipient and
project code: the lines, prices, total, billing period and whether the order
needs approval all come from the basket the server already validated.

Delivery is to one of the branch's **saved** addresses, chosen by id. There is
no field anywhere for a one-off address typed at checkout, and adding one to a
branch needs `SITE_MANAGE`, which a buyer does not hold.

### Reporting and billing

A dashboard's KPI bundle is spend, a trend, an order mix and a site count, and
the API serves each separately — rightly, since one endpoint returning all of
it would be a different query for every screen that used it. The composition
happens in `api-reports.adapter.ts`, in parallel, so a screen still costs one
round of requests.

Nothing there re-derives a total from a page of rows. A client-side sum only
adds up the page it happened to load, which is how a dashboard quietly
under-reports a busy month; every figure shown is one the server calculated.

Billing follows the order, not the shipment: **only shipped goods are billed**,
so a period shows nothing until its orders reach `DISPATCHED` or `DELIVERED`.
A draft recomputes on every generation and holds no invoice number; issuing
allocates the number and freezes the lines, after which those orders are never
picked up again. The statement's line items come from the _invoice_ once one
exists — re-deriving them from live orders is how a statement stops agreeing
with the invoice it explains — and from the period's orders before that, which
is what a mid-month preview is.

The audit trail is **read-only from the client**. The API writes an entry for
every mutation against the authenticated actor; `logAuditEvent` now throws
rather than silently recording nothing. A trail a browser can append to is not
a trail.

Invoice documents come from the server once an invoice has been issued. A PDF
assembled in the browser from the report on screen is a picture of what the
client believed it was billed; `/billing/invoices/:id/pdf` renders it from the
frozen invoice rows, which is what the customer was actually charged. The
client-side generation remains only as a mid-month preview, for a period that
has no invoice yet.

### Roles and permissions

The settings matrix is served by `/authorization/permissions` and is read-only
by design: the baseline is compiled into the API, and departures from it are
per-user grants on `/users/:userId/permissions`, not edits to the matrix.

This replaced `constants/rbac.ts`, a hand-maintained copy that had drifted into
a different vocabulary altogether — `MANAGE_CATALOGUE` where the API says
`CATALOG_MANAGE` — and so documented a permission model nothing enforced. It
has been deleted.

### Permissions the UI has to expect

- The customer account directory needs `ACCOUNT_MANAGE`, which only an
  administrator holds. A head-office user gets a 403; the adapters read that as
  an empty page and the screen says why, rather than showing an error.
- Sites, users, rate cards and orders are tenant-scoped server-side: a
  head-office user sees their own account's rows without the client filtering
  anything.
- A buyer cannot approve their own order, and a rejection must carry a reason —
  both refused by the API, so the screens surface the refusal rather than
  pre-empting it.
- A placed order is immutable apart from its status and payment. There is no
  edit endpoint: the lines and prices are the snapshot an invoice is drawn from.
- Reports need `REPORT_VIEW`, billing needs `BILLING_VIEW` and the audit trail
  needs `AUDIT_VIEW` — none of which a site user holds. Spend-by-account is
  `ACCOUNT_MANAGE`: it spans every customer, so the permission is the whole
  tenant boundary.

## Authentication

- `services/api.service.ts` attaches the bearer token, unwraps the API's error
  envelope into a typed `ApiError`, and on a 401 refreshes once and retries.
  Concurrent 401s share a single in-flight refresh — rotation invalidates the
  previous token, so racing refreshes would sign the user out mid-page-load.
- `store/authSlice.ts` holds the session. `components/auth/AuthProvider.tsx`
  restores it from `localStorage` on load and revalidates against `/auth/me`,
  so a role changed since the last visit takes effect on this load.
- `components/auth/AuthGuard.tsx` protects routes: unauthenticated users are
  redirected to `/login`, and a signed-in user without the role is shown what
  they do have access to. It hides screens — it does not protect data. Every
  API route re-checks the token and the caller's permissions server-side.

The session lives in `localStorage` rather than a cookie because the API is a
separate origin and authenticates with a bearer header, so a cookie would never
be sent.

## Scripts

| Command                       | What it does             |
| ----------------------------- | ------------------------ |
| `npm run dev`                 | Dev server on port 3000  |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` / `lint:fix`   | Oxlint                   |
| `npm run format`              | Prettier                 |

`npm run build` passes and `tsc --noEmit` is clean.
