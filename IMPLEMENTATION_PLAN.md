# Barangay Services Request Portal — Document Tracking System (DTS)
## Comprehensive Implementation Plan

**Project:** Barangay Public Portal + Document Tracking System  
**Stack:** React 18 + TypeScript + Tailwind CSS + shadcn/ui | Node.js + Express + TypeScript | Firebase  
**Date:** May 1, 2026  
**Total Estimated Tasks:** 72  

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Folder Structure](#folder-structure)
3. [Phase 1 — Project Setup & Infrastructure](#phase-1)
4. [Phase 2 — Backend Core](#phase-2)
5. [Phase 3 — Public Portal](#phase-3)
6. [Phase 4 — Resident Module](#phase-4)
7. [Phase 5 — DTS Core](#phase-5)
8. [Phase 6 — Admin Dashboard](#phase-6)
9. [Phase 7 — PDF/Print Generation](#phase-7)
10. [Phase 8 — Advanced Features](#phase-8)
11. [Phase 9 — Testing, Build & Deployment](#phase-9)
12. [Dependency Graph](#dependency-graph)
13. [Parallel Execution Matrix](#parallel-execution-matrix)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                              │
│  React 18 + TypeScript + Vite + Tailwind + shadcn/ui        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Public Site │  │ Resident App │  │  Admin Dashboard  │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS / REST
┌────────────────────────────▼────────────────────────────────┐
│                    API LAYER                                 │
│  Node.js + Express + TypeScript (ts-node / tsx)             │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ Auth API │ │ Docs API │ │ Track API  │ │  Admin API  │  │
│  └──────────┘ └──────────┘ └────────────┘ └─────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │ Firebase SDK (Admin)
┌────────────────────────────▼────────────────────────────────┐
│                  FIREBASE LAYER                              │
│  Firestore (DB) │ Firebase Auth │ Firebase Storage          │
└─────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│            ANDROID (Optional — Phase 8)                     │
│  Capacitor → builds React app into native Android APK       │
└─────────────────────────────────────────────────────────────┘
```

### Key Data Flow: Document Request
```
Resident fills form → POST /api/requests
  → Backend generates Tracking ID (BRY-YYYY-XXXXX)
  → Backend generates QR Code PNG (stored in Firebase Storage)
  → Firestore document created (status: PENDING)
  → DTS slip PDF generated (Office + Client copy)
  → Email/SMS notification sent
  → Resident receives Tracking ID + QR on screen
  → Resident/anyone tracks at /track?id=BRY-YYYY-XXXXX
```

### Tracking ID Format
```
BRY-2026-00001   (Barangay prefix, year, 5-digit sequence)
```

### Status Workflow
```
PENDING → RECEIVED → PROCESSING → FOR_RELEASE → RELEASED
                         ↓
                      REJECTED (at any stage)
```

---

## Folder Structure

```
barangay-portal/
├── client/                          # React frontend (Vite)
│   ├── public/
│   │   ├── favicon.ico
│   │   └── barangay-seal.png
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn/ui components
│   │   │   ├── layout/              # Header, Footer, Sidebar
│   │   │   ├── public/              # Public portal components
│   │   │   ├── resident/            # Resident-facing components
│   │   │   ├── admin/               # Admin dashboard components
│   │   │   ├── dts/                 # DTS-specific components
│   │   │   └── shared/              # Reusable across modules
│   │   ├── pages/
│   │   │   ├── public/              # Landing, About, Services, etc.
│   │   │   ├── auth/                # Login, Register, Reset
│   │   │   ├── resident/            # Dashboard, Request, Track
│   │   │   └── admin/               # Admin pages
│   │   ├── hooks/                   # Custom React hooks
│   │   ├── context/                 # React Context providers
│   │   ├── lib/                     # Firebase client, utils
│   │   ├── services/                # API call functions
│   │   ├── types/                   # Shared TypeScript types
│   │   ├── routes/                  # React Router config
│   │   ├── store/                   # Zustand state (optional)
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── server/                          # Express backend
│   ├── src/
│   │   ├── config/                  # Firebase admin, env config
│   │   ├── controllers/             # Route handler logic
│   │   ├── middleware/              # Auth, validation, error
│   │   ├── routes/                  # Express route definitions
│   │   ├── services/                # Business logic layer
│   │   ├── types/                   # Backend TypeScript types
│   │   ├── utils/                   # Tracking ID gen, QR, helpers
│   │   └── index.ts                 # Entry point
│   ├── tsconfig.json
│   └── package.json
│
├── shared/                          # Shared types (client + server)
│   └── types/
│       ├── request.types.ts
│       ├── user.types.ts
│       └── document.types.ts
│
├── android/                         # Capacitor Android (Phase 8)
├── .env.example
├── .gitignore
└── README.md
```

---

## Phase 1 — Project Setup & Infrastructure {#phase-1}

> **Goal:** Monorepo scaffolding, tooling, environment config, Firebase project init.

---

### TASK-01
**Title:** Monorepo Initialization & Root Config  
**Description:** Initialize the monorepo root with `.gitignore`, `README.md`, root `package.json` (npm workspaces), and `.env.example`. Set up shared type packages.  
**Files to Create:**
- `package.json` (root, workspaces: ["client","server","shared"])
- `.gitignore`
- `.env.example`
- `README.md`
- `shared/types/request.types.ts`
- `shared/types/user.types.ts`
- `shared/types/document.types.ts`
- `shared/package.json`

**Dependencies:** None  
**Complexity:** Low  
**Parallel:** Yes (can start immediately)

---

### TASK-02
**Title:** Vite + React + TypeScript Frontend Scaffold  
**Description:** Scaffold the `client/` directory using Vite with the React-TypeScript template. Configure path aliases (`@/` → `src/`), set up `tsconfig.json` with strict mode.  
**Files to Create:**
- `client/package.json`
- `client/vite.config.ts`
- `client/tsconfig.json`
- `client/index.html`
- `client/src/main.tsx`
- `client/src/App.tsx`

**Dependencies:** TASK-01  
**Complexity:** Low  
**Parallel:** Yes (parallel with TASK-03)

---

### TASK-03
**Title:** Node.js + Express + TypeScript Backend Scaffold  
**Description:** Scaffold the `server/` directory. Configure `tsconfig.json`, `tsx` for dev hot-reload, and a basic Express server entry point with health-check route.  
**Files to Create:**
- `server/package.json`
- `server/tsconfig.json`
- `server/src/index.ts`
- `server/src/config/env.ts`

**Dependencies:** TASK-01  
**Complexity:** Low  
**Parallel:** Yes (parallel with TASK-02)

---

### TASK-04
**Title:** Tailwind CSS + shadcn/ui Setup  
**Description:** Install and configure Tailwind CSS v3, `tailwind.config.ts`, and `postcss.config.js`. Initialize shadcn/ui (CLI init), configure component path, set color theme (barangay brand: civic blue + green). Add base CSS variables for theming.  
**Files to Create/Modify:**
- `client/tailwind.config.ts`
- `client/postcss.config.js`
- `client/src/index.css`
- `client/components.json` (shadcn config)

**Dependencies:** TASK-02  
**Complexity:** Low  
**Parallel:** Yes (parallel with TASK-05)

**Notes:**
```ts
// tailwind.config.ts — Brand colors
colors: {
  primary: { DEFAULT: "#1A56DB", ... },  // civic blue
  secondary: { DEFAULT: "#057A55", ... } // government green
}
```

---

### TASK-05
**Title:** Firebase Project Setup & Environment Variables  
**Description:** Create Firebase project (manual step documented), enable Firestore, Firebase Auth (email/password + Google), and Firebase Storage. Configure security rules for each. Export service account key for backend admin SDK. Document all env vars in `.env.example`.  
**Files to Create/Modify:**
- `.env.example` (update with all Firebase vars)
- `server/src/config/firebase-admin.ts`
- `client/src/lib/firebase.ts`
- `firestore.rules`
- `storage.rules`

**Dependencies:** TASK-01  
**Complexity:** Medium  
**Parallel:** Yes

**Firestore Collections Schema:**
```
users/          {uid, name, email, address, contactNo, role, createdAt}
requests/       {trackingId, userId, docType, status, timeline[], qrUrl, createdAt, updatedAt}
documents/      {id, name, description, requirements[], fee, processingDays, isActive}
announcements/  {id, title, body, imageUrl, publishedAt, isActive}
auditLogs/      {id, action, performedBy, targetId, details, timestamp}
walkInRequests/ {id, encodedBy, ...same as requests}
```

**Firestore Security Rules (draft):**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
      allow read: if isAdmin();
    }
    match /requests/{requestId} {
      allow create: if request.auth != null;
      allow read: if resource.data.userId == request.auth.uid || isAdmin();
      allow update: if isAdmin() || isStaff();
    }
    match /documents/{docId} {
      allow read: if true; // public
      allow write: if isAdmin();
    }
    match /announcements/{id} {
      allow read: if true;
      allow write: if isAdmin();
    }
  }
}
```

---

### TASK-06
**Title:** React Router v6 Setup + Route Architecture  
**Description:** Install React Router v6. Define the full route tree with lazy-loaded pages, nested routes for authenticated sections, and route guards (ProtectedRoute, AdminRoute components).  
**Files to Create:**
- `client/src/routes/index.tsx`
- `client/src/routes/ProtectedRoute.tsx`
- `client/src/routes/AdminRoute.tsx`
- `client/src/routes/PublicOnlyRoute.tsx`

**Dependencies:** TASK-02, TASK-04  
**Complexity:** Medium  
**Parallel:** Yes

**Route Tree:**
```
/                          → PublicLayout
  /                        → HomePage
  /about                   → AboutPage
  /services                → ServicesPage
  /announcements           → AnnouncementsPage
  /contact                 → ContactPage
  /track                   → PublicTrackPage (query: ?id=)
  /login                   → LoginPage (PublicOnlyRoute)
  /register                → RegisterPage (PublicOnlyRoute)
  /resident                → ResidentLayout (ProtectedRoute)
    /dashboard             → ResidentDashboard
    /request/:docType      → RequestFormPage
    /my-requests           → MyRequestsPage
    /track/:trackingId     → ResidentTrackPage
    /profile               → ProfilePage
  /admin                   → AdminLayout (AdminRoute)
    /dashboard             → AdminDashboard
    /requests              → RequestsManagementPage
    /requests/:id          → RequestDetailPage
    /walk-in               → WalkInEncodingPage
    /documents             → DocumentsManagementPage
    /announcements         → AnnouncementsManagementPage
    /users                 → UsersManagementPage
    /audit-logs            → AuditLogsPage
    /settings              → SettingsPage
```

---

### TASK-07
**Title:** Global State & Auth Context  
**Description:** Create React Context for authentication state (Firebase Auth onAuthStateChanged listener). Create `AuthContext` providing `user`, `userRole`, `loading`, `logout`. Create `useAuth` hook.  
**Files to Create:**
- `client/src/context/AuthContext.tsx`
- `client/src/hooks/useAuth.ts`
- `client/src/hooks/useFirestore.ts`

**Dependencies:** TASK-05, TASK-06  
**Complexity:** Medium  
**Parallel:** Yes (parallel with other Phase 1 tasks)

---

### TASK-08
**Title:** Base Layout Components  
**Description:** Create reusable layout shells: `PublicLayout` (header + footer + mobile nav), `ResidentLayout` (sidebar + topbar), `AdminLayout` (full admin sidebar + topbar). Create base `Header`, `Footer`, `Sidebar`, `Topbar` components with responsive behavior.  
**Files to Create:**
- `client/src/components/layout/PublicLayout.tsx`
- `client/src/components/layout/ResidentLayout.tsx`
- `client/src/components/layout/AdminLayout.tsx`
- `client/src/components/layout/Header.tsx`
- `client/src/components/layout/Footer.tsx`
- `client/src/components/layout/Sidebar.tsx`
- `client/src/components/layout/Topbar.tsx`
- `client/src/components/layout/MobileNav.tsx`

**Dependencies:** TASK-04, TASK-06, TASK-07  
**Complexity:** Medium  
**Parallel:** Yes

---

## Phase 2 — Backend Core {#phase-2}

> **Goal:** All Express API routes, Firebase Admin integration, auth middleware, and core business logic.

---

### TASK-09
**Title:** Express Middleware Stack  
**Description:** Configure global middleware: `cors` (whitelist frontend origins), `helmet` (security headers), `express.json` body parser, `morgan` (request logging), centralized error handler, and request ID middleware for tracing.  
**Files to Create/Modify:**
- `server/src/index.ts`
- `server/src/middleware/auth.middleware.ts`
- `server/src/middleware/error.middleware.ts`
- `server/src/middleware/validate.middleware.ts`
- `server/src/middleware/rateLimit.middleware.ts`

**Dependencies:** TASK-03, TASK-05  
**Complexity:** Medium  
**Parallel:** Yes

**Security Notes:**
- Rate limit all auth endpoints: 10 req/min per IP
- Validate Firebase ID token on every protected route
- Sanitize all inputs using `express-validator`
- CORS: only allow configured `FRONTEND_URL` env var

---

### TASK-10
**Title:** Firebase Admin SDK Configuration  
**Description:** Initialize Firebase Admin SDK using service account credentials from env vars (not a raw JSON file — parse from env for security). Create Firestore, Auth, and Storage admin instances. Export typed wrappers.  
**Files to Create:**
- `server/src/config/firebase-admin.ts`
- `server/src/config/env.ts` (zod-validated env schema)

**Dependencies:** TASK-05, TASK-09  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-11
**Title:** Auth API Routes  
**Description:** Implement auth endpoints. Note: Firebase Auth handles token issuance client-side; backend validates tokens and manages roles via Firestore custom claims.  
**Files to Create:**
- `server/src/routes/auth.routes.ts`
- `server/src/controllers/auth.controller.ts`
- `server/src/services/auth.service.ts`

**Endpoints:**
```
POST /api/auth/register        → Create Firestore user doc, assign 'resident' role
POST /api/auth/set-role        → Admin only: assign role ('admin','staff','resident')
GET  /api/auth/me              → Return current user profile from Firestore
PUT  /api/auth/profile         → Update user profile
POST /api/auth/verify-token    → Validate Firebase ID token (used by middleware)
```

**Dependencies:** TASK-09, TASK-10  
**Complexity:** Medium  
**Parallel:** Yes (parallel with TASK-12, TASK-13)

---

### TASK-12
**Title:** Document Types API Routes  
**Description:** CRUD for the official document types the barangay offers (Barangay Clearance, Certificate of Residency, Indigency, etc.). Each document type stores its name, requirements list, fee, processing days, and template config.  
**Files to Create:**
- `server/src/routes/documents.routes.ts`
- `server/src/controllers/documents.controller.ts`
- `server/src/services/documents.service.ts`

**Endpoints:**
```
GET    /api/documents              → List all active document types (public)
GET    /api/documents/:id          → Get single document type (public)
POST   /api/documents              → Admin: create document type
PUT    /api/documents/:id          → Admin: update document type
DELETE /api/documents/:id          → Admin: deactivate (soft delete)
```

**Document Types to Seed:**
```
1. Barangay Clearance
2. Certificate of Residency
3. Certificate of Indigency
4. Business Clearance
5. Certificate of Good Moral Character
6. Barangay ID
7. First-Time Job Seeker Certificate
8. Certificate of Cohabitation
9. Solo Parent Certificate
10. Death Certificate Attestation
```

**Dependencies:** TASK-09, TASK-10  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-13
**Title:** Tracking ID Generator & QR Code Service  
**Description:** Core utility for generating unique, sequential Tracking IDs. Use Firestore transaction counter to ensure uniqueness. Generate QR code PNG buffer from the tracking URL. Upload QR PNG to Firebase Storage and return public URL.  
**Files to Create:**
- `server/src/utils/trackingId.util.ts`
- `server/src/utils/qrCode.util.ts`
- `server/src/services/storage.service.ts`

**Dependencies:** TASK-10  
**Complexity:** Medium  
**Parallel:** Yes

**Implementation Detail:**
```typescript
// trackingId.util.ts
// Uses Firestore transaction on counters/requests document
// to atomically increment and return next sequence number
export async function generateTrackingId(year: number): Promise<string> {
  const counterRef = db.doc(`counters/requests_${year}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const next = (snap.exists ? snap.data()!.count : 0) + 1;
    tx.set(counterRef, { count: next }, { merge: true });
    return `BRY-${year}-${String(next).padStart(5, '0')}`;
  });
}

// qrCode.util.ts
// Generates QR pointing to: {FRONTEND_URL}/track?id={trackingId}
import QRCode from 'qrcode';
export async function generateQRCodeBuffer(trackingId: string): Promise<Buffer> {
  const url = `${process.env.FRONTEND_URL}/track?id=${trackingId}`;
  return QRCode.toBuffer(url, { type: 'png', width: 300, margin: 2 });
}
```

---

### TASK-14
**Title:** Document Request API Routes  
**Description:** The core request management API. Handles creation of new requests (online), status updates, and timeline logging. This is the most critical backend module.  
**Files to Create:**
- `server/src/routes/requests.routes.ts`
- `server/src/controllers/requests.controller.ts`
- `server/src/services/requests.service.ts`
- `server/src/types/request.types.ts`

**Endpoints:**
```
POST   /api/requests                      → Create new online request
GET    /api/requests/track/:trackingId    → Public tracking (no auth needed)
GET    /api/requests/my                   → Resident: list own requests
GET    /api/requests/:id                  → Get single request (owner or staff)
PUT    /api/requests/:id/status           → Staff/Admin: update status
PUT    /api/requests/:id/cancel           → Resident: cancel pending request
GET    /api/requests                      → Admin: list all requests (paginated, filterable)
POST   /api/requests/walk-in             → Staff: encode walk-in request
```

**Request Payload (POST /api/requests):**
```typescript
interface CreateRequestPayload {
  documentTypeId: string;
  purpose: string;
  requesterName: string;
  requesterAddress: string;
  requesterContact: string;
  requesterEmail?: string;
  additionalFields: Record<string, string>; // doc-type-specific fields
  attachments?: string[]; // Firebase Storage URLs
}
```

**Response includes:**
```typescript
{
  trackingId: "BRY-2026-00001",
  qrCodeUrl: "https://storage.googleapis.com/...",
  status: "PENDING",
  createdAt: "2026-05-01T..."
}
```

**Dependencies:** TASK-11, TASK-12, TASK-13  
**Complexity:** High  
**Parallel:** No (depends on TASK-13)

---

### TASK-15
**Title:** Status Update & Timeline Service  
**Description:** Implement the status transition logic with validation (PENDING→RECEIVED→PROCESSING→FOR_RELEASE→RELEASED, or any→REJECTED). Each transition appends a timeline entry with timestamp, actor, and optional notes. Emit Firestore updates that the frontend can listen to in real-time.  
**Files to Create:**
- `server/src/services/timeline.service.ts`
- `server/src/utils/statusTransition.util.ts`

**Dependencies:** TASK-14  
**Complexity:** Medium  
**Parallel:** Yes (after TASK-14)

**Timeline Entry Schema:**
```typescript
interface TimelineEntry {
  status: RequestStatus;
  timestamp: Timestamp;
  updatedBy: string;     // staff UID or 'system'
  updatedByName: string;
  notes?: string;
  isPublic: boolean;     // shown to resident on tracking page
}
```

---

### TASK-16
**Title:** Announcements API Routes  
**Description:** CRUD for barangay announcements. Include image upload to Firebase Storage. Support pagination and filtering by active status.  
**Files to Create:**
- `server/src/routes/announcements.routes.ts`
- `server/src/controllers/announcements.controller.ts`
- `server/src/services/announcements.service.ts`

**Endpoints:**
```
GET    /api/announcements           → List active announcements (public, paginated)
GET    /api/announcements/:id       → Single announcement (public)
POST   /api/announcements           → Admin: create
PUT    /api/announcements/:id       → Admin: update
DELETE /api/announcements/:id       → Admin: soft delete
```

**Dependencies:** TASK-09, TASK-10  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-17
**Title:** Audit Logging Service  
**Description:** Create a centralized audit logging service that records all significant actions (request created, status changed, document downloaded, admin action, etc.) to the `auditLogs` Firestore collection. Integrate as middleware/helper called from controllers.  
**Files to Create:**
- `server/src/services/audit.service.ts`
- `server/src/utils/auditLogger.util.ts`

**Dependencies:** TASK-10  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-18
**Title:** Admin Analytics API  
**Description:** Aggregate endpoints for admin dashboard stats: total requests by status, requests per document type, daily/weekly/monthly trend, processing time averages, staff performance.  
**Files to Create:**
- `server/src/routes/analytics.routes.ts`
- `server/src/controllers/analytics.controller.ts`
- `server/src/services/analytics.service.ts`

**Dependencies:** TASK-14, TASK-17  
**Complexity:** Medium  
**Parallel:** Yes (after TASK-14)

**Endpoints:**
```
GET /api/analytics/summary          → {total, pending, processing, released, rejected}
GET /api/analytics/by-type          → Requests grouped by document type
GET /api/analytics/trend?period=7d  → Daily request counts for trend chart
GET /api/analytics/processing-time  → Avg days from PENDING to RELEASED per doc type
```

---

## Phase 3 — Public Portal {#phase-3}

> **Goal:** All public-facing pages. SEO-friendly, accessible, mobile responsive.

---

### TASK-19
**Title:** shadcn/ui Component Installation & Theme  
**Description:** Install required shadcn/ui components. Customize the default theme to use barangay brand colors. Create a `ThemeProvider` wrapper. Install all needed UI components at once.  
**Files to Create/Modify:**
- `client/src/components/ui/` (shadcn components)
- `client/src/lib/utils.ts` (`cn` helper)

**Components to Install:**
```
button, card, badge, input, label, select, textarea, dialog, 
sheet, dropdown-menu, navigation-menu, tabs, table, toast,
progress, separator, avatar, skeleton, form, checkbox, 
radio-group, switch, calendar, popover, command, alert,
breadcrumb, pagination, tooltip, accordion
```

**Dependencies:** TASK-04  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-20
**Title:** Home / Landing Page  
**Description:** Hero section with barangay name, captain's message, and CTA buttons (Track Document, Request Document, View Services). Stats bar (residents served, documents processed). Quick links section. Announcements preview carousel (latest 3). Emergency hotlines section.  
**Files to Create:**
- `client/src/pages/public/HomePage.tsx`
- `client/src/components/public/HeroSection.tsx`
- `client/src/components/public/StatsBar.tsx`
- `client/src/components/public/QuickLinks.tsx`
- `client/src/components/public/AnnouncementsPreview.tsx`
- `client/src/components/public/HotlinesSection.tsx`

**Dependencies:** TASK-08, TASK-19  
**Complexity:** Medium  
**Parallel:** Yes (parallel with TASK-21, TASK-22, TASK-23, TASK-24)

---

### TASK-21
**Title:** About Page  
**Description:** Barangay history, vision/mission, barangay officials grid (with photos), organizational chart, map/location, contact details.  
**Files to Create:**
- `client/src/pages/public/AboutPage.tsx`
- `client/src/components/public/OfficialsGrid.tsx`
- `client/src/components/public/OrgChart.tsx`

**Dependencies:** TASK-08, TASK-19  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-22
**Title:** Services Page  
**Description:** Grid/list of all available document services with name, description, requirements, fee, processing time. Each service card has a "Request Now" CTA that routes to login (if not authenticated) or request form.  
**Files to Create:**
- `client/src/pages/public/ServicesPage.tsx`
- `client/src/components/public/ServiceCard.tsx`
- `client/src/components/public/RequirementsModal.tsx`
- `client/src/services/documents.service.ts` (API call)

**Dependencies:** TASK-08, TASK-12, TASK-19  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-23
**Title:** Announcements Page  
**Description:** Paginated list of barangay announcements with search/filter. Individual announcement detail page with full content and image.  
**Files to Create:**
- `client/src/pages/public/AnnouncementsPage.tsx`
- `client/src/pages/public/AnnouncementDetailPage.tsx`
- `client/src/components/public/AnnouncementCard.tsx`

**Dependencies:** TASK-08, TASK-16, TASK-19  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-24
**Title:** Contact Page  
**Description:** Contact form (name, email, message) that saves to Firestore. Embedded Google Maps iframe for barangay hall location. Office hours table. Social media links. Emergency contacts.  
**Files to Create:**
- `client/src/pages/public/ContactPage.tsx`
- `client/src/components/public/ContactForm.tsx`

**Dependencies:** TASK-08, TASK-19  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-25
**Title:** Public Document Tracking Page  
**Description:** A public-facing tracking page accessible without login. Input field for Tracking ID (also accepts QR scan via camera on mobile). Displays current status, timeline, and document details. Real-time updates via Firestore listener. This is a key feature for walk-in clients.  
**Files to Create:**
- `client/src/pages/public/PublicTrackPage.tsx`
- `client/src/components/dts/TrackingInput.tsx`
- `client/src/components/dts/StatusBadge.tsx`
- `client/src/components/dts/TimelineDisplay.tsx`
- `client/src/components/dts/TrackingResult.tsx`

**Dependencies:** TASK-08, TASK-14, TASK-19  
**Complexity:** Medium  
**Parallel:** Yes (after Phase 2 TASK-14)

---

## Phase 4 — Resident Module {#phase-4}

> **Goal:** Authentication flow, resident dashboard, document request forms, and request management.

---

### TASK-26
**Title:** Authentication Pages (Login, Register, Reset Password)  
**Description:** Login page (email/password + Google Sign-In). Register page with profile fields (name, address, contact number, birthdate). Forgot password via Firebase email link. Form validation with `react-hook-form` + `zod`. Post-login redirect logic.  
**Files to Create:**
- `client/src/pages/auth/LoginPage.tsx`
- `client/src/pages/auth/RegisterPage.tsx`
- `client/src/pages/auth/ForgotPasswordPage.tsx`
- `client/src/components/auth/LoginForm.tsx`
- `client/src/components/auth/RegisterForm.tsx`
- `client/src/services/auth.service.ts`

**Dependencies:** TASK-07, TASK-08, TASK-19  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-27
**Title:** Resident Dashboard  
**Description:** Post-login dashboard showing: active requests summary (with status badges), recent requests table, quick action buttons (New Request, Track Document), profile completeness indicator, notifications/alerts panel.  
**Files to Create:**
- `client/src/pages/resident/ResidentDashboard.tsx`
- `client/src/components/resident/ActiveRequestsSummary.tsx`
- `client/src/components/resident/RecentRequestsTable.tsx`
- `client/src/components/resident/QuickActions.tsx`
- `client/src/components/resident/NotificationsPanel.tsx`
- `client/src/services/requests.service.ts`

**Dependencies:** TASK-26, TASK-14  
**Complexity:** Medium  
**Parallel:** Yes (after TASK-26)

---

### TASK-28
**Title:** Document Request Form — Base  
**Description:** Multi-step request form (stepper UI): Step 1: Select Document Type (with requirements checklist). Step 2: Personal Information (pre-filled from profile). Step 3: Document-specific fields (dynamic based on doc type). Step 4: File attachments (if required). Step 5: Review & Submit. On submit: call POST /api/requests, show success modal with Tracking ID + QR code.  
**Files to Create:**
- `client/src/pages/resident/RequestFormPage.tsx`
- `client/src/components/resident/RequestStepper.tsx`
- `client/src/components/resident/StepDocumentSelect.tsx`
- `client/src/components/resident/StepPersonalInfo.tsx`
- `client/src/components/resident/StepDocumentFields.tsx`
- `client/src/components/resident/StepAttachments.tsx`
- `client/src/components/resident/StepReview.tsx`
- `client/src/components/resident/SuccessModal.tsx`
- `client/src/components/shared/FileUploader.tsx`

**Dependencies:** TASK-27, TASK-14  
**Complexity:** High  
**Parallel:** No (depends on TASK-27)

---

### TASK-29
**Title:** Dynamic Document Fields Configuration  
**Description:** Each document type has custom fields (e.g., Business Clearance needs business name + nature; Solo Parent Certificate needs number of children). Create a field configuration system where admin can define extra fields per document type. Frontend renders them dynamically in Step 3 of the request form.  
**Files to Create:**
- `client/src/types/documentFields.types.ts`
- `client/src/components/resident/DynamicFieldRenderer.tsx`
- `server/src/utils/documentFields.util.ts`

**Dependencies:** TASK-28  
**Complexity:** Medium  
**Parallel:** Yes (after TASK-28)

**Field Types Supported:**
```typescript
type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';

interface DocumentField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // for 'select' type
  placeholder?: string;
}
```

---

### TASK-30
**Title:** My Requests Page  
**Description:** Paginated table of all resident's requests. Filterable by status, document type, date range. Each row shows tracking ID, doc type, status badge, submitted date, action buttons (View, Track, Download if released, Cancel if pending).  
**Files to Create:**
- `client/src/pages/resident/MyRequestsPage.tsx`
- `client/src/components/resident/RequestsTable.tsx`
- `client/src/components/resident/RequestFilters.tsx`
- `client/src/components/resident/RequestStatusBadge.tsx`

**Dependencies:** TASK-27  
**Complexity:** Medium  
**Parallel:** Yes (parallel with TASK-28)

---

### TASK-31
**Title:** Resident Request Detail & Tracking Page  
**Description:** Detailed view of a single request. Shows full timeline with status history, document info, QR code display, estimated release date. Download button for released documents. Real-time status updates via Firestore `onSnapshot`.  
**Files to Create:**
- `client/src/pages/resident/ResidentTrackPage.tsx`
- `client/src/components/dts/RequestDetailCard.tsx`
- `client/src/components/dts/QRCodeDisplay.tsx`
- `client/src/hooks/useRequestTracker.ts`

**Dependencies:** TASK-30, TASK-25  
**Complexity:** Medium  
**Parallel:** Yes (after TASK-30)

---

### TASK-32
**Title:** Resident Profile Page  
**Description:** Edit personal information (name, address, contact), change password (via Firebase), upload profile photo to Firebase Storage. Show account verification status.  
**Files to Create:**
- `client/src/pages/resident/ProfilePage.tsx`
- `client/src/components/resident/ProfileForm.tsx`
- `client/src/components/resident/AvatarUpload.tsx`

**Dependencies:** TASK-26  
**Complexity:** Low  
**Parallel:** Yes (parallel with TASK-28)

---

## Phase 5 — DTS Core {#phase-5}

> **Goal:** The tracking system engine — tracking IDs, QR codes, real-time status, and the DTS slip generation.

---

### TASK-33
**Title:** Real-Time Status Tracking Hook  
**Description:** Create `useRequestTracker` hook that subscribes to a Firestore `onSnapshot` listener for a given tracking ID. Returns `{ request, timeline, isLoading, error }`. Auto-unsubscribes on unmount. Used by both resident and public tracking pages.  
**Files to Create:**
- `client/src/hooks/useRequestTracker.ts`
- `client/src/hooks/useRealtimeRequest.ts`

**Dependencies:** TASK-05, TASK-14  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-34
**Title:** Timeline Visual Component  
**Description:** Vertical timeline UI showing each status change with icon, label, timestamp, actor name, and optional notes. Animated transitions. Supports both compact and expanded views. Uses status-specific colors and icons.  
**Files to Create:**
- `client/src/components/dts/Timeline.tsx`
- `client/src/components/dts/TimelineStep.tsx`
- `client/src/utils/statusConfig.ts`

**Dependencies:** TASK-19, TASK-33  
**Complexity:** Medium  
**Parallel:** Yes

**Status Config:**
```typescript
export const STATUS_CONFIG = {
  PENDING:      { label: 'Pending',       color: 'yellow', icon: ClockIcon },
  RECEIVED:     { label: 'Received',      color: 'blue',   icon: InboxIcon },
  PROCESSING:   { label: 'Processing',    color: 'purple', icon: CogIcon },
  FOR_RELEASE:  { label: 'For Release',   color: 'orange', icon: PackageIcon },
  RELEASED:     { label: 'Released',      color: 'green',  icon: CheckCircleIcon },
  REJECTED:     { label: 'Rejected',      color: 'red',    icon: XCircleIcon },
};
```

---

### TASK-35
**Title:** QR Code Scanner Component (Mobile)  
**Description:** Implement in-browser QR code scanning using the device camera. Use `html5-qrcode` library. Renders as a camera viewfinder that auto-detects QR codes and auto-fills the tracking ID input. Falls back gracefully on desktop.  
**Files to Create:**
- `client/src/components/dts/QRScanner.tsx`
- `client/src/hooks/useQRScanner.ts`

**Dependencies:** TASK-19  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-36
**Title:** DTS Slip HTML Template  
**Description:** Design the DTS slip as a print-ready HTML/React component. Two sections side-by-side: Office Copy (left) and Client Copy (right), separated by a dashed cut line. Each copy includes: Barangay header with seal, request details, QR code, tracking ID (large, bold), status, requester info, issue date, official signature line. Optimized for A4 paper printing.  
**Files to Create:**
- `client/src/components/dts/DTSSlip.tsx`
- `client/src/components/dts/DTSSlipOffice.tsx`
- `client/src/components/dts/DTSSlipClient.tsx`
- `client/src/styles/print.css`

**Dependencies:** TASK-34  
**Complexity:** Medium  
**Parallel:** Yes

**Print CSS approach:**
```css
/* print.css */
@media print {
  body * { visibility: hidden; }
  #dts-slip, #dts-slip * { visibility: visible; }
  #dts-slip { position: absolute; left: 0; top: 0; width: 100%; }
  @page { size: A4; margin: 10mm; }
}
```

---

### TASK-37
**Title:** Print DTS Slip Trigger & Print Preview  
**Description:** "Print DTS Slip" button that opens a print-preview modal showing both copies. Uses `window.print()` with a print-specific CSS class toggle. Also provides a "Download as PDF" option using `html2canvas` + `jspdf`.  
**Files to Create:**
- `client/src/components/dts/PrintSlipButton.tsx`
- `client/src/components/dts/PrintPreviewModal.tsx`
- `client/src/utils/printUtils.ts`

**Dependencies:** TASK-36  
**Complexity:** Medium  
**Parallel:** Yes (after TASK-36)

---

## Phase 6 — Admin Dashboard {#phase-6}

> **Goal:** Complete admin/staff interface for managing requests, updating statuses, encoding walk-ins, and viewing analytics.

---

### TASK-38
**Title:** Admin Dashboard Home — Analytics Overview  
**Description:** Main admin dashboard page. KPI cards: Total Requests, Pending, Processing, Released Today, Rejected. Bar chart: Requests by document type (last 30 days). Line chart: Daily request trend (last 14 days). Recent activity feed. Staff on-duty indicator.  
**Files to Create:**
- `client/src/pages/admin/AdminDashboard.tsx`
- `client/src/components/admin/KPICard.tsx`
- `client/src/components/admin/RequestsBarChart.tsx`
- `client/src/components/admin/TrendLineChart.tsx`
- `client/src/components/admin/ActivityFeed.tsx`

**Libraries:** `recharts` for charts  
**Dependencies:** TASK-08, TASK-18, TASK-19  
**Complexity:** High  
**Parallel:** Yes

---

### TASK-39
**Title:** Requests Management Page  
**Description:** Full admin view of all document requests. Advanced filterable/sortable table: filter by status, document type, date range, requester name. Bulk status update. Export to CSV. Click row to open Request Detail panel (slide-over drawer).  
**Files to Create:**
- `client/src/pages/admin/RequestsManagementPage.tsx`
- `client/src/components/admin/RequestsDataTable.tsx`
- `client/src/components/admin/RequestFiltersBar.tsx`
- `client/src/components/admin/RequestDetailDrawer.tsx`
- `client/src/components/admin/BulkStatusUpdate.tsx`
- `client/src/utils/csvExport.ts`

**Dependencies:** TASK-38, TASK-14  
**Complexity:** High  
**Parallel:** Yes (after TASK-38)

---

### TASK-40
**Title:** Request Detail Page (Admin View)  
**Description:** Full-page view of a single request. Shows all requester info, document type details, full timeline, staff notes log. Status update form (dropdown + notes textarea + confirm). Print DTS slip button. Generate PDF document button. Assign to staff dropdown.  
**Files to Create:**
- `client/src/pages/admin/RequestDetailPage.tsx`
- `client/src/components/admin/StatusUpdateForm.tsx`
- `client/src/components/admin/StaffNotesLog.tsx`
- `client/src/components/admin/RequestInfoPanel.tsx`

**Dependencies:** TASK-39, TASK-37  
**Complexity:** High  
**Parallel:** No (depends on TASK-39)

---

### TASK-41
**Title:** Walk-In Request Encoding  
**Description:** Staff-side form for encoding walk-in requests (residents who appear in person without prior online request). Same multi-step form as resident request but with additional fields: date received, payment received flag, amount, notes. Generates tracking ID and prints DTS slip immediately.  
**Files to Create:**
- `client/src/pages/admin/WalkInEncodingPage.tsx`
- `client/src/components/admin/WalkInForm.tsx`
- `client/src/components/admin/WalkInSuccessPanel.tsx`

**Dependencies:** TASK-40, TASK-28  
**Complexity:** Medium  
**Parallel:** Yes (after TASK-40)

---

### TASK-42
**Title:** Document Types Management Page  
**Description:** Admin CRUD for the document types catalog. Table with toggle active/inactive, edit form for requirements, fees, processing days. "Manage Fields" modal to configure dynamic fields for each document type.  
**Files to Create:**
- `client/src/pages/admin/DocumentsManagementPage.tsx`
- `client/src/components/admin/DocumentTypeForm.tsx`
- `client/src/components/admin/FieldsConfigModal.tsx`

**Dependencies:** TASK-38, TASK-12  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-43
**Title:** Announcements Management Page  
**Description:** Admin CRUD for announcements. Rich text editor (TipTap or simple textarea), image upload, publish/unpublish toggle, schedule publish date.  
**Files to Create:**
- `client/src/pages/admin/AnnouncementsManagementPage.tsx`
- `client/src/components/admin/AnnouncementForm.tsx`
- `client/src/components/admin/RichTextEditor.tsx`

**Dependencies:** TASK-38, TASK-16  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-44
**Title:** Users Management Page  
**Description:** Admin view of all registered users. Search/filter by name, role. Change user role (resident/staff/admin). View user's request history. Deactivate accounts.  
**Files to Create:**
- `client/src/pages/admin/UsersManagementPage.tsx`
- `client/src/components/admin/UsersTable.tsx`
- `client/src/components/admin/RoleChangeModal.tsx`

**Dependencies:** TASK-38, TASK-11  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-45
**Title:** Audit Logs Page  
**Description:** Paginated, filterable table of all audit log entries. Filter by action type, date range, staff member. Each row expandable to show full details JSON.  
**Files to Create:**
- `client/src/pages/admin/AuditLogsPage.tsx`
- `client/src/components/admin/AuditLogsTable.tsx`

**Dependencies:** TASK-38, TASK-17  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-46
**Title:** Admin Settings Page  
**Description:** Manage barangay profile info (name, address, captain name, contact), office hours, service fees (override per doc type), email notification templates, system maintenance mode toggle.  
**Files to Create:**
- `client/src/pages/admin/SettingsPage.tsx`
- `client/src/components/admin/BarangayInfoForm.tsx`
- `client/src/components/admin/NotificationTemplates.tsx`

**Dependencies:** TASK-38  
**Complexity:** Low  
**Parallel:** Yes

---

## Phase 7 — PDF/Print Generation {#phase-7}

> **Goal:** Generate downloadable PDFs for barangay documents and printable DTS slips.

---

### TASK-47
**Title:** PDF Generation Service — Backend  
**Description:** Backend service using `pdf-lib` to generate official barangay documents as PDFs. Each document type has a template. Templates include: barangay letterhead/seal, pre-filled requester data, official content per document type, signature block, date, control number. Documents are generated on demand when admin approves and releases, stored in Firebase Storage.  
**Files to Create:**
- `server/src/services/pdf.service.ts`
- `server/src/utils/pdfTemplates/barangayClearance.ts`
- `server/src/utils/pdfTemplates/certificateOfResidency.ts`
- `server/src/utils/pdfTemplates/certificateOfIndigency.ts`
- `server/src/utils/pdfTemplates/businessClearance.ts`
- `server/src/utils/pdfTemplates/baseTemplate.ts`

**Endpoints to add:**
```
POST /api/requests/:id/generate-pdf   → Admin: generate & store PDF
GET  /api/requests/:id/download-pdf   → Resident/Admin: get signed download URL
```

**Dependencies:** TASK-14, TASK-15  
**Complexity:** High  
**Parallel:** Yes (after Phase 2)

**PDF Template Structure (pdf-lib):**
```typescript
// baseTemplate.ts — Common elements
async function addLetterhead(page: PDFPage, barangayInfo: BarangayInfo) {
  // Republic of Philippines header
  // Province/City/Municipality
  // BARANGAY [NAME] text (large, bold)
  // Barangay seal image (embedded PNG)
  // Horizontal divider line
}
```

---

### TASK-48
**Title:** PDF Template — Barangay Clearance  
**Description:** Full PDF template for Barangay Clearance. Includes: letterhead, document title, "TO WHOM IT MAY CONCERN" body, purpose statement, requester certification text, signature of Punong Barangay, official dry seal placeholder, date, CTC/OR number field.  
**Files to Create:**
- `server/src/utils/pdfTemplates/barangayClearance.ts`

**Dependencies:** TASK-47  
**Complexity:** Medium  
**Parallel:** Yes (after TASK-47, parallel with TASK-49–51)

---

### TASK-49
**Title:** PDF Template — Certificate of Residency  
**Description:** PDF for Certificate of Residency. Body certifying the person has been residing at the given address for X years/months.  
**Files to Create:**
- `server/src/utils/pdfTemplates/certificateOfResidency.ts`

**Dependencies:** TASK-47  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-50
**Title:** PDF Template — Certificate of Indigency  
**Description:** PDF for Certificate of Indigency. Certifies the resident belongs to an indigent family.  
**Files to Create:**
- `server/src/utils/pdfTemplates/certificateOfIndigency.ts`

**Dependencies:** TASK-47  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-51
**Title:** PDF Template — Business Clearance & Others  
**Description:** PDF templates for Business Clearance, Good Moral Character, First-Time Job Seeker Certificate, Cohabitation Certificate.  
**Files to Create:**
- `server/src/utils/pdfTemplates/businessClearance.ts`
- `server/src/utils/pdfTemplates/goodMoral.ts`
- `server/src/utils/pdfTemplates/firstTimeJobSeeker.ts`
- `server/src/utils/pdfTemplates/cohabitation.ts`

**Dependencies:** TASK-47  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-52
**Title:** PDF Download Flow — Frontend  
**Description:** When a request status is `RELEASED`, show a "Download Document" button in the resident's request detail page. Calls `/api/requests/:id/download-pdf` to get a signed URL, then triggers browser download. Show PDF preview in an iframe before download.  
**Files to Create:**
- `client/src/components/resident/DownloadDocumentButton.tsx`
- `client/src/components/shared/PDFPreviewModal.tsx`

**Dependencies:** TASK-47, TASK-31  
**Complexity:** Medium  
**Parallel:** Yes (after TASK-47)

---

### TASK-53
**Title:** DTS Slip PDF Generation (Backend)  
**Description:** Backend generation of the DTS slip as a PDF (alternative to browser print). Produces a 2-column A4 PDF with Office Copy and Client Copy separated by a dotted cut line. Includes all DTS fields and embedded QR code image.  
**Files to Create:**
- `server/src/utils/pdfTemplates/dtsSlip.ts`

**Endpoints to add:**
```
GET /api/requests/:id/dts-slip-pdf  → Returns PDF buffer for DTS slip
```

**Dependencies:** TASK-47  
**Complexity:** Medium  
**Parallel:** Yes

---

## Phase 8 — Advanced Features {#phase-8}

> **Goal:** Notifications, PWA support, SMS/email integration, Capacitor Android build.

---

### TASK-54
**Title:** Email Notification Service  
**Description:** Integrate `nodemailer` with Gmail SMTP (or SendGrid) to send transactional emails: (1) Request submitted confirmation with tracking ID + QR, (2) Status update notifications, (3) Document ready for release notice, (4) Rejection notification with reason. Use HTML email templates.  
**Files to Create:**
- `server/src/services/email.service.ts`
- `server/src/utils/emailTemplates/requestConfirmation.html`
- `server/src/utils/emailTemplates/statusUpdate.html`
- `server/src/utils/emailTemplates/documentReady.html`
- `server/src/utils/emailTemplates/rejection.html`

**Dependencies:** TASK-14, TASK-15  
**Complexity:** Medium  
**Parallel:** Yes (after Phase 2)

---

### TASK-55
**Title:** In-App Notifications  
**Description:** Firestore-backed notification system. On status changes, create a notification document for the resident. Frontend polls/listens for unread notifications. Notification bell icon in header shows badge count. Notification dropdown lists recent notifications.  
**Files to Create:**
- `server/src/services/notification.service.ts`
- `client/src/components/shared/NotificationBell.tsx`
- `client/src/components/shared/NotificationDropdown.tsx`
- `client/src/hooks/useNotifications.ts`

**Dependencies:** TASK-15, TASK-27  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-56
**Title:** PWA Configuration  
**Description:** Configure the app as a Progressive Web App using `vite-plugin-pwa`. Add `manifest.json` with app icons, name, theme color. Enable service worker for offline caching of static assets. Add "Add to Home Screen" prompt.  
**Files to Create/Modify:**
- `client/vite.config.ts` (add PWA plugin)
- `client/public/manifest.json`
- `client/public/icons/` (various sizes: 192x192, 512x512, etc.)
- `client/src/components/shared/InstallPrompt.tsx`

**Dependencies:** TASK-02  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-57
**Title:** Capacitor Android Setup  
**Description:** Install Capacitor and add the Android platform. Configure `capacitor.config.ts` with the app bundle ID, app name, server URL. Sync the built web app into the Android project. Configure permissions (camera for QR scanning, internet).  
**Files to Create:**
- `capacitor.config.ts`
- `android/` (auto-generated by Capacitor)

**Commands:**
```bash
npm install @capacitor/core @capacitor/android
npx cap init "Barangay Portal" com.barangay.portal
npx cap add android
npm run build  # Build React first
npx cap sync android
npx cap open android  # Opens Android Studio
```

**Dependencies:** TASK-56 (PWA done first)  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-58
**Title:** SMS Notification Integration (Optional)  
**Description:** Integrate with a Philippine SMS gateway (Semaphore or Vonage) to send SMS notifications for key status updates. Primarily for residents without email. Include opt-in/opt-out preference in user profile.  
**Files to Create:**
- `server/src/services/sms.service.ts`

**Dependencies:** TASK-54  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-59
**Title:** Request Search & Advanced Filtering  
**Description:** Full-text search across requests using Firestore + a search index (or Algolia for production). Instant search in admin request table. Search by requester name, tracking ID, contact number.  
**Files to Create:**
- `server/src/services/search.service.ts`
- `client/src/components/shared/SearchInput.tsx`
- `client/src/hooks/useSearch.ts`

**Dependencies:** TASK-39  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-60
**Title:** CSV/Excel Export  
**Description:** Admin can export filtered request data to CSV or Excel (`.xlsx` using `xlsx` package). Export includes all relevant fields. Used for reporting and offline backup.  
**Files to Create:**
- `server/src/utils/exportUtils.ts`

**Endpoint:**
```
GET /api/requests/export?format=csv&status=RELEASED&from=2026-01-01&to=2026-12-31
```

**Dependencies:** TASK-39  
**Complexity:** Low  
**Parallel:** Yes

---

## Phase 9 — Testing, Build Verification & Deployment Prep {#phase-9}

> **Goal:** End-to-end verification, error handling polish, environment configs, and deployment readiness.

---

### TASK-61
**Title:** Backend Unit Tests  
**Description:** Write unit tests with `vitest` (or `jest`) for: tracking ID generator (uniqueness, format), status transition validator (valid/invalid transitions), PDF template output validation, auth middleware (valid/invalid tokens).  
**Files to Create:**
- `server/src/__tests__/trackingId.test.ts`
- `server/src/__tests__/statusTransition.test.ts`
- `server/src/__tests__/auth.middleware.test.ts`

**Dependencies:** TASK-13, TASK-15, TASK-09  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-62
**Title:** Frontend Component Tests  
**Description:** Write tests with `vitest` + `@testing-library/react` for: RequestStepper form validation, StatusBadge rendering for all statuses, Timeline rendering, TrackingInput QR/manual input.  
**Files to Create:**
- `client/src/__tests__/RequestStepper.test.tsx`
- `client/src/__tests__/StatusBadge.test.tsx`
- `client/src/__tests__/Timeline.test.tsx`
- `client/src/__tests__/TrackingInput.test.tsx`

**Dependencies:** TASK-28, TASK-34  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-63
**Title:** Error Boundary & Fallback UI  
**Description:** Add React Error Boundaries around major route sections. Create user-friendly fallback UI for crashes. Add 404 Not Found page, 403 Forbidden page. Handle API error states gracefully in all data-fetching hooks.  
**Files to Create:**
- `client/src/components/shared/ErrorBoundary.tsx`
- `client/src/pages/NotFoundPage.tsx`
- `client/src/pages/ForbiddenPage.tsx`
- `client/src/components/shared/EmptyState.tsx`
- `client/src/components/shared/ErrorAlert.tsx`

**Dependencies:** TASK-06  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-64
**Title:** Loading States & Skeleton Screens  
**Description:** Add proper loading states everywhere data is fetched. Create skeleton components for: Dashboard stats, Requests table rows, Document cards, Announcement cards, Timeline. Replace all `loading...` text with polished skeletons.  
**Files to Create:**
- `client/src/components/shared/SkeletonCard.tsx`
- `client/src/components/shared/SkeletonTable.tsx`
- `client/src/components/shared/SkeletonTimeline.tsx`
- `client/src/components/shared/PageLoader.tsx`

**Dependencies:** TASK-19  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-65
**Title:** Accessibility (a11y) Audit & Fixes  
**Description:** Audit all pages for WCAG 2.1 AA compliance. Add ARIA labels to icon-only buttons. Ensure color contrast ratios meet standards. Add keyboard navigation to all interactive elements. Test with screen reader (NVDA). Fix any issues found.  
**Files to Modify:** Various component files  
**Dependencies:** All Phase 3–6 tasks  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-66
**Title:** Responsive Design Polish  
**Description:** Test all pages on: mobile (375px), tablet (768px), desktop (1280px), widescreen (1920px). Fix any layout breaks. Ensure admin tables are scrollable horizontally on mobile. Ensure DTS slip is readable when printed.  
**Files to Modify:** Various component files  
**Dependencies:** All Phase 3–6 tasks  
**Complexity:** Medium  
**Parallel:** Yes (parallel with TASK-65)

---

### TASK-67
**Title:** Environment Configuration & Build Scripts  
**Description:** Configure separate environments: development, staging, production. Create `.env.development`, `.env.staging`, `.env.production` templates. Update Vite config for env-specific builds. Create build verification script that checks all required env vars are set before build.  
**Files to Create/Modify:**
- `.env.development`
- `.env.staging`  
- `.env.production`
- `client/vite.config.ts`
- `scripts/check-env.ts`
- `scripts/build-all.sh`

**Dependencies:** TASK-02, TASK-03  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-68
**Title:** Firebase Security Rules — Final Review  
**Description:** Review and tighten all Firestore and Storage security rules. Ensure: residents can only read their own requests, public tracking endpoint only exposes non-sensitive fields, staff can only update (not delete) requests, admin has full access, anonymous users can only read public documents/announcements.  
**Files to Modify:**
- `firestore.rules`
- `storage.rules`

**Dependencies:** All backend tasks  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-69
**Title:** Firestore Indexes & Performance  
**Description:** Create composite Firestore indexes required for filtered queries (requests by userId + status + createdAt, requests by status + documentTypeId, etc.). Document all required indexes in `firestore.indexes.json`.  
**Files to Create:**
- `firestore.indexes.json`

**Dependencies:** TASK-14, TASK-18  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-70
**Title:** Database Seeding Script  
**Description:** Create a seed script to populate Firestore with: initial document types (10 types with full details), sample barangay settings, a test admin user, sample announcements. Runnable with `npm run seed`.  
**Files to Create:**
- `scripts/seed.ts`
- `scripts/seedData/documentTypes.ts`
- `scripts/seedData/announcements.ts`

**Dependencies:** TASK-10, TASK-12  
**Complexity:** Low  
**Parallel:** Yes

---

### TASK-71
**Title:** Docker & Deployment Configuration  
**Description:** Create `Dockerfile` for the Express backend. Create `docker-compose.yml` for local full-stack dev. Write deployment guide for: Firebase Hosting (frontend), Cloud Run or Railway (backend). Configure CI/CD with GitHub Actions.  
**Files to Create:**
- `server/Dockerfile`
- `docker-compose.yml`
- `.github/workflows/deploy.yml`
- `DEPLOYMENT.md`

**Dependencies:** TASK-67  
**Complexity:** Medium  
**Parallel:** Yes

---

### TASK-72
**Title:** Final Integration Testing & UAT Checklist  
**Description:** Create a User Acceptance Testing (UAT) checklist covering all user flows. Perform end-to-end manual testing: full resident flow (register → request → track → download), admin flow (login → view requests → update status → generate PDF), walk-in flow, public track without login. Document any bugs found and fix critical ones.  
**Files to Create:**
- `UAT_CHECKLIST.md`

**Dependencies:** All previous tasks  
**Complexity:** High  
**Parallel:** No (final task)

---

## Dependency Graph

```
TASK-01 (Root)
├── TASK-02 (Vite/React)
│   ├── TASK-04 (Tailwind/shadcn)
│   │   ├── TASK-06 (Router)
│   │   │   ├── TASK-07 (AuthContext)
│   │   │   └── TASK-08 (Layouts)
│   │   └── TASK-19 (shadcn components)
│   │       ├── TASK-20 (HomePage)
│   │       ├── TASK-21 (AboutPage)
│   │       ├── TASK-22 (ServicesPage)
│   │       ├── TASK-23 (AnnouncementsPage)
│   │       ├── TASK-24 (ContactPage)
│   │       └── TASK-25 (PublicTrackPage)
│   └── TASK-67 (Build Config)
├── TASK-03 (Express)
│   └── TASK-09 (Middleware)
│       └── TASK-10 (Firebase Admin)
│           ├── TASK-11 (Auth API)
│           ├── TASK-12 (Documents API)
│           ├── TASK-13 (TrackingID + QR)
│           │   └── TASK-14 (Requests API)
│           │       ├── TASK-15 (Status/Timeline)
│           │       │   ├── TASK-54 (Email)
│           │       │   └── TASK-55 (In-App Notif)
│           │       ├── TASK-18 (Analytics API)
│           │       └── TASK-47 (PDF Service)
│           │           ├── TASK-48 (Clearance PDF)
│           │           ├── TASK-49 (Residency PDF)
│           │           ├── TASK-50 (Indigency PDF)
│           │           ├── TASK-51 (Other PDFs)
│           │           └── TASK-53 (DTS Slip PDF)
│           ├── TASK-16 (Announcements API)
│           └── TASK-17 (Audit Logging)
└── TASK-05 (Firebase Setup)
```

---

## Parallel Execution Matrix

| Sprint | Tasks (Parallel Groups) |
|--------|--------------------------|
| **Sprint 1** | TASK-01, TASK-05 |
| **Sprint 2** | TASK-02, TASK-03 (parallel) |
| **Sprint 3** | TASK-04, TASK-09 (parallel) |
| **Sprint 4** | TASK-06, TASK-07, TASK-08, TASK-10 (parallel) |
| **Sprint 5** | TASK-11, TASK-12, TASK-13, TASK-16, TASK-17 (parallel) |
| **Sprint 6** | TASK-14, TASK-19 (parallel) |
| **Sprint 7** | TASK-15, TASK-18, TASK-20, TASK-21, TASK-22, TASK-23, TASK-24, TASK-25, TASK-26 (parallel) |
| **Sprint 8** | TASK-27, TASK-30, TASK-32, TASK-33, TASK-34, TASK-35, TASK-47 (parallel) |
| **Sprint 9** | TASK-28, TASK-36, TASK-38, TASK-48, TASK-49, TASK-50, TASK-51 (parallel) |
| **Sprint 10** | TASK-29, TASK-31, TASK-37, TASK-39, TASK-40, TASK-52, TASK-53, TASK-54, TASK-55 (parallel) |
| **Sprint 11** | TASK-41, TASK-42, TASK-43, TASK-44, TASK-45, TASK-46, TASK-56, TASK-57, TASK-58, TASK-59, TASK-60 (parallel) |
| **Sprint 12** | TASK-61, TASK-62, TASK-63, TASK-64, TASK-65, TASK-66, TASK-67, TASK-68, TASK-69, TASK-70, TASK-71 (parallel) |
| **Sprint 13** | TASK-72 (final integration — sequential) |

---

## Key Technical Decisions & Notes

### Security
- Never store Firebase service account JSON in the repo — parse credentials from env vars at runtime
- All file uploads go to Firebase Storage with per-user path rules (`/uploads/{uid}/...`)
- PDF documents in Storage use signed URLs with 1-hour expiry for downloads
- Express rate limiting on all endpoints (esp. auth: 10/min, requests: 30/min)
- Input validation on every API endpoint using `express-validator` or `zod`

### Scalability
- Use Firestore pagination cursors (not offset) for all list endpoints
- Composite indexes created upfront for known query patterns
- QR code PNGs cached in Storage — never regenerated unless manually triggered
- PDF generation is async; status moves to `PDF_GENERATING` briefly, then `RELEASED`

### Offline / Resilience
- PWA service worker caches public pages and document catalog offline
- Request form saves draft to `localStorage` — resumed if user closes tab mid-fill
- All API calls have retry logic (3 retries with exponential backoff via `axios-retry`)

### Print Quality
- DTS slip uses fixed px measurements calibrated for A4 (210mm × 297mm)
- QR code minimum 2cm × 2cm in print to ensure scanner readability
- Official documents use serif font (for formal appearance) — embed as Base64 in pdf-lib

### Tracking ID Uniqueness
- Counter stored in Firestore `counters/requests_{year}` doc
- Firestore transaction guarantees atomic increment — no duplicates possible
- Counter resets each calendar year (new sequence per year)
- Format: `BRY-2026-00001` through `BRY-2026-99999` (supports 99,999 requests/year)

---

## Summary

| Phase | Tasks | Complexity |
|-------|-------|------------|
| Phase 1 — Setup | 8 | Low–Medium |
| Phase 2 — Backend | 10 | Medium–High |
| Phase 3 — Public Portal | 7 | Low–Medium |
| Phase 4 — Resident Module | 7 | Medium–High |
| Phase 5 — DTS Core | 5 | Medium |
| Phase 6 — Admin Dashboard | 9 | Medium–High |
| Phase 7 — PDF/Print | 7 | Medium–High |
| Phase 8 — Advanced | 7 | Low–Medium |
| Phase 9 — Testing/Deploy | 12 | Low–High |
| **Total** | **72** | |

**Recommended Team Allocation:**
- 1 Backend developer → Phase 2, 7 (server-side)
- 1 Frontend developer → Phase 3, 4 (public + resident)
- 1 Frontend developer → Phase 6 (admin dashboard)
- All 3 → Phase 5, 8, 9 (DTS, advanced, testing)
- Solo developer → Follow sprint order above, ~13 sprints of ~3–5 days each
