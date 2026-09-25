# 🇳🇿 NZ Post Shipping API — Complete Integration Guide

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-requisites](#pre-requisites)
3. [Authentication (OAuth 2.0)](#authentication)
4. [API #1 — ParcelAddress API](#1-parceladdress-api)
5. [API #2 — ShippingOptions API](#2-shippingoptions-api)
6. [API #3 — ParcelLabel API](#3-parcellabel-api)
7. [API #4 — ParcelPickup API](#4-parcelpickup-api)
8. [API #5 — ParcelTrack API](#5-parceltrack-api)
9. [API #6 — Collect My Parcel APIs](#6-collect-my-parcel-apis)
10. [Cost Analysis](#cost-analysis)
11. [Integration Architecture](#integration-architecture)
12. [Integration Roadmap (MVP vs Full)](#integration-roadmap)
13. [Development Effort Estimate](#development-effort-estimate)
14. [Environments (Sandbox / Production)](#environments)
15. [Support & Contact](#support--contact)
16. [Quick Reference Links](#quick-reference-links)

---

## Overview

NZ Post provides **6 RESTful Shipping APIs** for eCommerce businesses to integrate shipping, tracking, addressing, and label generation directly into their websites or warehouse management systems. All APIs are hosted on the **MuleSoft Anypoint Exchange Portal**.

> **💡 KEY POINT: API calls are FREE!** NZ Post does not charge per API call. You only pay for shipping when labels are physically scanned by NZ Post couriers.

**Source Page:** [https://www.nzpost.co.nz/business/ecommerce/shipping-apis](https://www.nzpost.co.nz/business/ecommerce/shipping-apis)

---

## Pre-requisites

Before integrating any API, you need the following:

| #   | Requirement                       | Details                                                                                                                                                                                                                                                 |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **NZ Post / CourierPost Account** | Your organisation must have an active business account number                                                                                                                                                                                           |
| 2   | **Developer Portal Registration** | Register at [NZ Post Developer Portal](https://login.nzpost.co.nz/login?service=https%3A%2F%2Fwww.nzpost.co.nz%2Fuser%3Fdestination%3Duser%252Fdeveloper-centre%252Fregister&register=1). The email you provide becomes your Developer Portal username. |
| 3   | **Accept Terms & Conditions**     | Review and accept the [Shipping API T&Cs](https://www.nzpost.co.nz/business/terms-and-conditions/shipping-api)                                                                                                                                          |
| 4   | **Request API Access**            | After registration, request access and receive your API keys (`client_id` + `client_secret`) from the Developer Portal                                                                                                                                  |
| 5   | **Authentication Setup**          | Implement OAuth 2.0 Client Credentials flow (details below)                                                                                                                                                                                             |

---

## Authentication

All NZ Post APIs use **OAuth 2.0 Client Credentials** grant type.

### Token Request

```
POST https://oauth.nzpost.co.nz/as/token.oauth2
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
```

### Example Response

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### Usage in API Calls

```
GET https://api.nzpost.co.nz/parceladdress/2.0/addresses?q=123+Main+Street
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

> ⚠️ **IMPORTANT:** Cache and reuse the access token until it expires. Do NOT request a new token on every API call — this will get your access rate-limited.

---

## 1. ParcelAddress API

**Address Auto-Complete & Validation**

| Property          | Details                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Address search, auto-complete (type-ahead), and validation                                                                                     |
| **Coverage**      | NZ domestic + International (Google Places powered) + Australian addresses                                                                     |
| **Use Case**      | Checkout page address field with real-time auto-suggestions                                                                                    |
| **Version**       | v1.0.x                                                                                                                                         |
| **Documentation** | [ParcelAddress API Docs](https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/parceladdress-api/) |

### Key Endpoints

| Method | Endpoint                               | Description                                     |
| ------ | -------------------------------------- | ----------------------------------------------- |
| `GET`  | `/addresses`                           | Search for domestic NZ addresses                |
| `GET`  | `/addresses/{addressId}`               | Get full address details by addressId           |
| `GET`  | `/addresses/dpid/{dpid}`               | Get address details by Delivery Point ID (DPID) |
| `GET`  | `/suburbs`                             | Domestic suburbs suggestion                     |
| `GET`  | `/international/addresses`             | Search for international addresses              |
| `GET`  | `/international/addresses/{addressId}` | Get international address details               |
| `GET`  | `/au/addresses`                        | Australian address lookup                       |
| `GET`  | `/collection-locations`                | Find nearby collection point locations          |

### Documentation Pages Available

- Home / Introduction
- ParcelAddress Overview
- Getting Started
- Use Case
- Environments and Testing
- Versioning Strategy
- Authentication
- Search for Address
- Get Address Detail - addressid
- Get Address Detail - dpid
- Domestic Suburbs Suggestion
- Collection Locations
- Search for International Address
- Get International Address Detail
- Australian Address Lookup
- Notebook (interactive testing)

### How It Works

```
Customer types "123 Main" in checkout
        ↓
Your Website calls GET /addresses?q=123+Main
        ↓
API returns list of matching validated addresses
        ↓
Customer selects their address from the dropdown
        ↓
Your Website calls GET /addresses/{addressId}
        ↓
API returns full validated address + DPID (Delivery Point ID)
        ↓
You store DPID → used in ShippingOptions API for rate calculation
```

### Key Benefits

- ✅ **Reduces failed deliveries** — addresses are validated against NZ Post's network
- ✅ **Rural identification** — automatically flags rural addresses for correct surcharge
- ✅ **International support** — powered by Google Places for international addresses
- ✅ **Faster checkout** — type-ahead reduces customer effort

---

## 2. ShippingOptions API

**Shipping Rates & Delivery Choices**

| Property          | Details                                                                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Returns available shipping options with your organisation's negotiated rates                                                                       |
| **Depends on**    | ParcelAddress API (needs address DPID/details)                                                                                                     |
| **Use Case**      | Shopping cart page — show shipping methods and prices to customer                                                                                  |
| **Version**       | v1.0.x                                                                                                                                             |
| **Documentation** | [ShippingOptions API Docs](https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/shippingoptions-api/) |

### Key Endpoints

| Method | Endpoint                | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| `GET`  | `/domestic`             | Domestic shipping options (NZ addresses) |
| `GET`  | `/domestic` (Legacy)    | Legacy domestic endpoint                 |
| `GET`  | `/international`        | International shipping options           |
| `GET`  | Service cost breakdown  | Detailed cost breakdown per service      |
| `GET`  | Customs charges options | Import/customs charge estimates          |

### Documentation Pages Available

- Home / Introduction
- Use Cases
- Getting Started
- Environments and Testing
- Versioning Strategy
- Authentication
- ShippingOptions Overview
- Domestic
- Domestic (Legacy)
- International
- Service cost breakdown
- Customs charges options
- Postman Collection (ready-to-import)
- SoapUI Collection

### What It Returns

- Available shipping services (Standard, Express, Economy, CourierPost, etc.)
- **Your organisation's negotiated rates** (contract-based pricing)
- Estimated delivery times
- Surcharges (rural delivery, signature required, evening delivery)
- Service cost breakdown
- International customs/duty estimates

### Required Input Parameters

| Parameter         | Description                             |
| ----------------- | --------------------------------------- |
| Sender address    | DPID or address coordinates of sender   |
| Receiver address  | DPID or address coordinates of receiver |
| Parcel weight     | Weight in kg                            |
| Parcel dimensions | Length × Width × Height in cm           |

> ⚠️ **LIMITATION:** This API only works for **NZ Post International, Domestic Courier, and Express services**. It **excludes** NZ Post mail services (e.g., Domestic mail, Parcel mail). Only services approved by NZ Post Sales will appear in results.

---

## 3. ParcelLabel API

**Shipping Label Generation (PDF)**

| Property          | Details                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**       | Generate shipping labels in PDF format                                                                                                     |
| **Depends on**    | ParcelAddress API + ShippingOptions API                                                                                                    |
| **Use Case**      | Warehouse/order fulfillment — auto-generate printable labels                                                                               |
| **Billing Model** | **Charged ONLY when courier scans the label** — unused labels are FREE                                                                     |
| **Documentation** | [ParcelLabel API Docs](https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/parcellabel-api/) |

### Key Features

- Generates domestic & international shipping labels
- Labels in **PDF format** — ready to print on standard label printers
- Supports all NZ Post services (Urgent, Express, Economy, International)
- Auto-generates **tracking numbers** (consignment numbers)
- **Unused labels can be voided** — no charge incurred
- Batch label generation supported

### How Billing Works

```
Label Generated (via API)     → ❌ No charge yet
Label Printed & Attached      → ❌ No charge yet
Courier Scans Label at Pickup → ✅ Shipping cost charged to your NZ Post account
Label Voided/Cancelled        → ❌ No charge ever
```

> 💡 **Cost optimization tip:** You can safely pre-generate labels for anticipated orders. If the order is cancelled, simply void the label — zero cost.

---

## 4. ParcelPickup API

**Schedule Courier Parcel Collection**

| Property          | Details                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Schedule NZ Post courier pickups from your business address                                                                                  |
| **Use Case**      | Automated pickup booking when orders are ready to ship                                                                                       |
| **Documentation** | [ParcelPickup API Docs](https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/parcelpickup-api/) |

### Key Features

- Schedule pickups at your business/warehouse address
- Customize pickup frequency for urgent orders
- Same-day pickup requests (subject to availability)
- Integrate with your order management / WMS system
- Reduce manual phone calls to arrange pickups

---

## 5. ParcelTrack API

**Shipment Tracking**

| Property          | Details                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Purpose**       | Track parcels in real-time — domestic & international                                                                                      |
| **Use Case**      | "Track My Order" page embedded on your website                                                                                             |
| **Documentation** | [ParcelTrack API Docs](https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/parceltrack-api/) |

### Key Features

- Real-time tracking events for domestic & international parcels
- Embed tracking info directly into your website (no need to redirect to NZ Post)
- Tracking statuses: `Picked up → In Transit → Out for Delivery → Delivered`
- Reduces customer support calls
- Can be used for proactive delivery notifications (email/SMS to customers)

### Tracking Data Returned

| Field              | Description                                  |
| ------------------ | -------------------------------------------- |
| Tracking number    | Consignment/tracking reference               |
| Current status     | Latest tracking event                        |
| Event history      | Full list of tracking events with timestamps |
| Estimated delivery | Expected delivery date                       |
| Location           | Last scan location                           |

---

## 6. Collect My Parcel APIs

**Customer Collection Point Delivery**

| Property          | Details                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Purpose**       | Let customers choose to pick up parcels from the nearest NZ Post collection point instead of home delivery                                           |
| **Sub-APIs**      | **Collection Address API** + **Collect My Parcel Label API**                                                                                         |
| **Use Case**      | Checkout page — offer "Pick up from nearby location" option                                                                                          |
| **Documentation** | [Collection Address API Docs](https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/collection-address/) |

### How It Works

1. **Collection Address API** → Shows nearby collection points based on customer's address
2. Customer selects a collection point
3. **Collect My Parcel Label API** → Generates a label addressed to that collection point
4. Parcel is delivered to the collection point
5. Customer is notified to pick up

---

## Cost Analysis

### API Usage Costs

| Item                               | Cost                                            |
| ---------------------------------- | ----------------------------------------------- |
| API Calls (all 6 APIs)             | **FREE** ✅                                     |
| Developer Portal Registration      | **FREE** ✅                                     |
| API Key (client_id + secret)       | **FREE** ✅                                     |
| Label Generation (unused/voided)   | **FREE** ✅                                     |
| Label Generation (courier scanned) | **Shipping cost charged to NZ Post account** 💳 |
| Sandbox/UAT Testing                | **FREE** ✅                                     |

> 📌 **Bottom line:** There is ZERO cost to use the APIs themselves. NZ Post has confirmed that if pricing or access terms change in the future, they will communicate changes in advance.

### Shipping Costs (When Labels Are Used)

Shipping rates are **negotiated per organization** with NZ Post Sales. The ShippingOptions API returns your contract-specific rates.

| Cost Type                        | Description                                                                |
| -------------------------------- | -------------------------------------------------------------------------- |
| **Base Shipping Rate**           | Negotiated contract rates (based on parcel weight, size, and service type) |
| **Rural Delivery Surcharge**     | Extra charge for rural NZ addresses (auto-detected by ParcelAddress API)   |
| **Signature Required**           | Optional surcharge for requiring signature on delivery                     |
| **Saturday/Evening Delivery**    | Premium time-slot surcharges                                               |
| **International Customs/Duties** | Destination country import charges (estimated via ShippingOptions API)     |

> 💡 Contact **NZ Post Sales** to negotiate bulk/volume-based rates for your business.

### Third-Party Platform Plugin Costs (If Not Doing Direct API Integration)

| Platform                             | Estimated Cost      | Notes                  |
| ------------------------------------ | ------------------- | ---------------------- |
| Direct API integration (custom code) | Developer time only | API itself is free     |
| WooCommerce NZ Post Plugin           | ~$79–$129 USD/year  | Third-party plugin fee |
| Shopify NZ Post App                  | ~$0–$49 USD/month   | Varies by app provider |
| Magento / BigCommerce Extensions     | Varies              | Some free, some paid   |

---

## Integration Architecture

### Full eCommerce Integration Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    CUSTOMER JOURNEY                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. CHECKOUT PAGE                                            │
│     └── Customer types address                               │
│         └── [ParcelAddress API] → Auto-suggest + Validate    │
│                                                              │
│  2. SHIPPING METHOD SELECTION                                │
│     └── Address validated (DPID obtained)                    │
│         └── [ShippingOptions API] → Show rates & options     │
│             └── Customer selects: Express / Standard / etc.  │
│                                                              │
│  3. ORDER CONFIRMED → Payment Processed                      │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                    BACKEND / WAREHOUSE                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  4. LABEL GENERATION                                         │
│     └── [ParcelLabel API] → Generate PDF label + Tracking #  │
│         └── Print label, attach to parcel                    │
│                                                              │
│  5. PICKUP SCHEDULING                                        │
│     └── [ParcelPickup API] → Schedule courier collection     │
│                                                              │
│  6. SHIPMENT TRACKING                                        │
│     └── [ParcelTrack API] → Real-time tracking updates       │
│         └── Show on "Track My Order" page                    │
│         └── Send email/SMS notifications to customer         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                    OPTIONAL                                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  7. COLLECTION POINTS (Alternative to home delivery)         │
│     └── [Collection Address API] → Show nearby pickup spots  │
│     └── [Collect My Parcel Label API] → Collection label     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Data Flow Between APIs

```
ParcelAddress API
    │
    ├── Output: addressId, DPID, validated address
    │
    ▼
ShippingOptions API
    │
    ├── Input: sender DPID, receiver DPID, weight, dimensions
    ├── Output: available services, rates, delivery estimates
    │
    ▼
ParcelLabel API
    │
    ├── Input: sender/receiver address, selected service, weight
    ├── Output: PDF label, tracking number (consignment #)
    │
    ▼
ParcelPickup API                    ParcelTrack API
    │                                   │
    ├── Input: pickup address,          ├── Input: tracking number
    │   parcel count, preferred time    ├── Output: tracking events,
    ├── Output: pickup confirmation     │   status, estimated delivery
    │                                   │
    ▼                                   ▼
Courier picks up parcels        Customer tracks on your site
```

---

## Integration Roadmap

### Phase 1 — MVP (Minimum Viable Product)

Start with these 3 core APIs to get shipping working:

| Priority | API                     | Integration Point           | Why It's Essential                            |
| -------- | ----------------------- | --------------------------- | --------------------------------------------- |
| 🥇 1st   | **ParcelAddress API**   | Checkout — address field    | Validates addresses → fewer failed deliveries |
| 🥈 2nd   | **ShippingOptions API** | Cart — shipping method      | Shows real shipping costs → no surprises      |
| 🥉 3rd   | **ParcelLabel API**     | Backend — order fulfillment | Generates labels → parcels can be shipped     |

### Phase 2 — Enhanced Experience

Add these after MVP is live:

| Priority | API                   | Integration Point           | Benefit                                 |
| -------- | --------------------- | --------------------------- | --------------------------------------- |
| ⭐ 4th   | **ParcelTrack API**   | "Track My Order" page       | Reduces customer support calls          |
| ⭐ 5th   | **ParcelPickup API**  | Backend — logistics         | Automates courier pickup scheduling     |
| ⭐ 6th   | **Collect My Parcel** | Checkout — delivery options | More delivery flexibility for customers |

---

## Development Effort Estimate

| Component                                             | Estimated Time  | Notes                                      |
| ----------------------------------------------------- | --------------- | ------------------------------------------ |
| Developer Portal Registration + API Key Approval      | 1–2 days        | May take 1-2 NZ business days for approval |
| OAuth 2.0 Authentication Module                       | 0.5 days        | Token caching + auto-refresh logic         |
| ParcelAddress API (type-ahead UI + address selection) | 2–3 days        | Frontend + backend integration             |
| ShippingOptions API (cart shipping display)           | 2–3 days        | Rate display + service selection UI        |
| ParcelLabel API (label generation + PDF handling)     | 2–3 days        | PDF generation, print/download flow        |
| ParcelTrack API (tracking page)                       | 1–2 days        | Tracking UI + status display               |
| ParcelPickup API (pickup scheduling)                  | 1 day           | Backend scheduling logic                   |
| Collect My Parcel (collection points)                 | 1–2 days        | Location finder UI + label variant         |
| End-to-End Testing (Sandbox)                          | 2–3 days        | Full flow testing in UAT environment       |
| Production Deployment + Go-live                       | 1 day           | Switch sandbox → production URLs           |
| **TOTAL (Full Integration — all 6 APIs)**             | **~12–18 days** | For 1-2 experienced developers             |
| **TOTAL (MVP — 3 core APIs only)**                    | **~7–10 days**  | Address + Shipping + Labels                |

---

## Environments

| Environment       | Base URL                         | Purpose                                                        |
| ----------------- | -------------------------------- | -------------------------------------------------------------- |
| **Sandbox / UAT** | Provided upon API access request | Testing with mock data — no real shipments created, no charges |
| **Production**    | Provided upon API access request | Live environment — real shipments and real charges             |

> ⚠️ **WARNING:** Always complete thorough testing in the Sandbox environment before switching to Production. Labels created in Production WILL incur charges when scanned by couriers.

### Testing Tools Provided by NZ Post

- **Postman Collection** — Ready-to-import collections for ShippingOptions API
- **SoapUI Collection** — For SOAP-based testing
- **Notebook** — Interactive testing environment (available for ParcelAddress API)

---

## Support & Contact

| Channel                                   | Details                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Developer Integration Support (Email)** | **techsupport@nzpost.co.nz**                                                                                                       |
| **Support Hours**                         | New Zealand business hours (NZST)                                                                                                  |
| **Developer Resource Centre**             | [nzpost.co.nz/business/ecommerce/developer-resource-centre](https://www.nzpost.co.nz/business/ecommerce/developer-resource-centre) |
| **MuleSoft API Portal (All Docs)**        | [anypoint.mulesoft.com/exchange/portals/nz-post-group/](https://anypoint.mulesoft.com/exchange/portals/nz-post-group/)             |
| **Shipping APIs Overview Page**           | [nzpost.co.nz/business/ecommerce/shipping-apis](https://www.nzpost.co.nz/business/ecommerce/shipping-apis)                         |
| **NZ Post Business Sales**                | Contact for rate negotiation and account setup                                                                                     |

---

## Quick Reference Links

| Resource                            | URL                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Shipping APIs Overview**          | https://www.nzpost.co.nz/business/ecommerce/shipping-apis                                                                                        |
| **Developer Resource Centre**       | https://www.nzpost.co.nz/business/ecommerce/developer-resource-centre                                                                            |
| **Developer Registration**          | https://login.nzpost.co.nz/login?service=https%3A%2F%2Fwww.nzpost.co.nz%2Fuser%3Fdestination%3Duser%252Fdeveloper-centre%252Fregister&register=1 |
| **ParcelAddress API Docs**          | https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/parceladdress-api/                             |
| **ShippingOptions API Docs**        | https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/shippingoptions-api/                           |
| **ParcelLabel API Docs**            | https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/parcellabel-api/                               |
| **ParcelPickup API Docs**           | https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/parcelpickup-api/                              |
| **ParcelTrack API Docs**            | https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/parceltrack-api/                               |
| **Collection Address API Docs**     | https://anypoint.mulesoft.com/exchange/portals/nz-post-group/b8271f09-2ad8-4e1c-b6b1-322c5727d148/collection-address/                            |
| **Shipping API Terms & Conditions** | https://www.nzpost.co.nz/business/terms-and-conditions/shipping-api                                                                              |
| **General API Terms & Conditions**  | https://www.nzpost.co.nz/business/terms-and-conditions/terms-and-conditions-for-api-use                                                          |

---

_Guide prepared on: September 2026_
_Source: NZ Post Official Website & MuleSoft Developer Portal_
