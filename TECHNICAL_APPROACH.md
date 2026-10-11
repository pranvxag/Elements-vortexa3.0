# GovFix Civic — Technical Approach

## 1. Purpose and scope

GovFix Civic is a civic-complaint application with a citizen-facing reporting and tracking experience and authenticated admin and contractor workspaces. Supabase Postgres is the shared source of truth. Cloudinary stores report and completion photographs. All portals use the same complaint records.

This repository implements the app with **Next.js 16 App Router, React 19, and TypeScript**. Next.js route handlers provide the server API. Supabase is accessed server-side using a service-role key, and Cloudinary is accessed server-side using its API secret. Neither credential is exposed to browser code.

Workflow:

```text
Citizen submits complaint
  -> Submitted
  -> Admin assigns an appropriate contractor
  -> Assigned
  -> Contractor begins field work
  -> In progress
  -> Contractor submits description and photos
  -> Work completed
  -> Admin approves -> Closed; evidence becomes citizen-visible
                 or -> Rework required -> contractor resumes
```

## 2. Design principles

1. **Single source of truth:** citizen, admin, and contractor views are database-backed and use the same Postgres complaint row.
2. **Server-mediated database access:** browsers call same-origin Next.js APIs. Only those handlers and the local importer use the Supabase service-role key.
3. **Role and ownership checks:** signed session roles scope every complaint query and mutation. A citizen can access only matching `citizen_mobile`; contractors can access only complaints assigned to their contractor ID.
4. **Atomic workflow changes:** Postgres functions update a complaint and append its history event inside one database transaction.
5. **Private image handling:** Cloudinary authenticated assets are returned through an API that checks session and complaint access. Completion images are citizen-readable only after approval.
6. **Controlled dataset seed:** an importer validates source files, preserves complaint tracking IDs, skips existing complaint IDs, and writes an import marker.

## 3. Components and technology

| Layer | Technology | Role |
|---|---|---|
| Page rendering/API | Next.js App Router | Public page, portals, server route handlers |
| UI | React, TypeScript, Tailwind CSS | Complaint form, tracking, admin review, contractor work queue |
| App session | Node.js HMAC, HttpOnly cookie | Role and identity assertion with expiration |
| Shared database | Supabase Postgres, `@supabase/supabase-js` | Complaint records, staff directory, categories, progress history |
| Atomic writes | Postgres PL/pgSQL RPCs | Create complaint+initial history; transition complaint+history |
| Photo storage | Cloudinary authenticated image delivery | Report and completion photo upload, signed download, cleanup |
| Optional map | Google Maps JavaScript API | Admin map visualization |
| Data seed | Node.js importer, Python standard-library XLSX parser | Import CSV and officer workbook records |

Important files:

- `app/page.tsx`: public landing experience and complaint submission.
- `components/portal-workflow.tsx`: citizen, admin, and contractor portals.
- `app/api/`: login/session endpoints; complaints, categories, contractors, workflow, and photo endpoints.
- `lib/supabase-admin.ts`: server-only Supabase client initialization.
- `lib/supabase-types.ts`: database table and RPC types.
- `lib/session.ts`: signed cookie session functions.
- `lib/cloudinary.ts`: authenticated uploads, deletes, and short-lived download URLs.
- `supabase/schema.sql`: database schema, migration-safe workflow columns, RLS, and transactional RPCs.
- `scripts/import-dataset.mjs`: data validation/import, loading `.env.local` for local CLI runs.

## 4. Authentication and sessions

`POST /api/auth/login` accepts a role, user ID, and password:

- Citizen uses a normalized mobile number (10–15 digits) and `CITIZEN_PASSWORD` (default `pass123`).
- Admin uses a normalized email that must match `admins.email_normalized`.
- Contractor uses a normalized phone number matching an active `contractors.phone_normalized`.
- Admin and contractor use `STAFF_PASSWORD` (default `admin`).

Successful login creates an eight-hour HMAC-signed, HttpOnly, SameSite=Strict `govfix_session` cookie. `/api/auth/session` verifies and returns its identity; `/api/auth/logout` clears the cookie.

**This is test authentication only.** Shared passwords do not prove that a person owns an email address or phone number. Before production, replace this with individually authenticated Supabase Auth identities and verified email/phone claims, along with account recovery and abuse protections.

## 5. Database model

`supabase/schema.sql` creates or extends these tables:

| Table | Purpose and notable columns |
|---|---|
| `complaints` | One row per tracking ID: category, title/details, location, citizen mobile, status, contractor assignment, photo metadata JSONB, timestamps |
| `complaint_updates` | Append-only timeline: tracking ID, event type/message, actor role/name, timestamp |
| `contractors` | Imported contractor IDs, normalized phone, categories, service zone/areas, active flag |
| `admins` | Imported officer IDs, normalized email, category and contact fields |
| `categories` | Category ID and display label |
| `dataset_imports` | One-time `govfix-v2` marker and import counts |

Indexes support citizen and contractor complaint lists, admin incremental updates, and per-complaint history retrieval. New complaints use `GF-<year>-<random>` IDs. Existing dataset IDs are preserved.

The repository originally included a public complaint table with a legacy `image_paths` field and public insert/read policies. The new SQL adds workflow fields to the existing complaint table instead of dropping its rows, revokes the broad table grants, enables RLS without public policies, and removes the known public image-upload policy. Review the SQL and take a database backup before applying it to a project with important existing data.

## 6. Database security and atomicity

The application uses the server-only Supabase service-role key. That key bypasses RLS; therefore:

- The browser must never receive it.
- API route handlers enforce role, citizen ownership, and contractor assignment checks before returning records or mutating data.
- The schema enables RLS and grants table/RPC access only to `service_role`; no `anon` or `authenticated` policies expose personal records.
- Do not add a broad public `SELECT` policy for complaints.

`create_complaint_with_update` inserts a new complaint and its initial history event atomically. `transition_complaint` locks the row, validates its current status (and optionally the assigned contractor), applies allowed workflow fields, updates its timestamp, and inserts the corresponding event within the same transaction.

## 7. End-to-end workflow and API

### 7.1 Complaint submit and retrieval

`POST /api/complaints` requires a citizen session, validates the category, complaint fields, coordinates, and image limits, uploads optional images to Cloudinary, and invokes `create_complaint_with_update`. On database failure it attempts to delete uploaded objects and returns an explicit cleanup error if cleanup fails.

`GET /api/complaints` scopes database results by citizen phone or contractor ID; admins can query all rows. Admin polling may send a `since` cursor, mapped to `updated_at >= cursor - 1 second`. `GET /api/complaints?id=<trackingId>` verifies record ownership/assignment and returns timeline details.

### 7.2 Contractor assignment

Admins list active contractors from `GET /api/contractors`. `POST /api/complaints/[trackingId]/assign` checks the selected contractor is active and category-compatible, then uses `transition_complaint` to save the assignment, status, and history event atomically.

### 7.3 Field work and completion

`POST /api/complaints/[trackingId]/status` only permits the assigned contractor to begin an `Assigned` or `Rework required` case. `POST /api/complaints/[trackingId]/completion` uploads 1–10 valid images and changes the complaint to `Work completed` with a completion description and history event through the transition RPC.

### 7.4 Admin review

`POST /api/complaints/[trackingId]/review` is admin-only:

- Approve: close the complaint, mark completion images public for the citizen, and append an approval event.
- Reject/request rework: require a reason, mark evidence private to staff, set `Rework required`, and append the reasoned event.

### 7.5 Photo access

Cloudinary objects are uploaded with `type: authenticated`. The application returns same-origin photo URLs. `GET /api/complaints/[trackingId]/photos/[photoId]` checks session, case access, and—when the requester is the citizen—the completion photo's `public` flag. It obtains a short-lived Cloudinary download signature and proxies the result with private/no-store response headers. Authorized users can still save or share photos after viewing them; deployment must follow relevant privacy and retention policy.

Allowed image formats are JPEG, PNG, and WebP, with a maximum of 10 images and 10 MB per image.

## 8. Dataset import

The ignored, local-only `Dataset/` directory must contain:

- `govfix_complaints_v2.csv`
- `govfix_contractors.csv`
- exactly one `govfix_officers*.xlsx`

`pnpm check:dataset` validates presence, record counts, identifiers, and normalized login identifiers without connecting to Supabase. `pnpm import:dataset` loads `.env.local`, reads the Supabase URL and service-role key, upserts staff and categories, skips complaint IDs already in Supabase, inserts source complaint rows and import history, then records `dataset_imports/govfix-v2` (table key `govfix-v2`). A successful marker prevents re-import from overwriting workflow data.

This is an initial import tool, not a continuous sync or general database migration system. A partial import failure can require inspection of the database before retrying.

## 9. Local setup

Requirements: Node.js 20+, pnpm, Python 3, an existing Supabase project, and Cloudinary credentials for image handling.

1. Install dependencies and create local settings:

   ```bash
   pnpm install
   cp .env.example .env.local
   ```

2. Apply `supabase/schema.sql` from Supabase SQL Editor after reviewing/backing up any existing schema.
3. Set server values in `.env.local`:

   ```dotenv
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<server-only service-role key>
   SESSION_SECRET=<unique random value of at least 32 bytes>
   CLOUDINARY_CLOUD_NAME=<cloud name>
   CLOUDINARY_API_KEY=<API key>
   CLOUDINARY_API_SECRET=<API secret>
   CITIZEN_PASSWORD=pass123
   STAFF_PASSWORD=admin
   ```

   Supabase publishable/anon keys are not sufficient for this custom server session model; the server handlers require a service-role/secret key. Keep all server secrets off the client and out of source control. Generate a local session secret with `openssl rand -base64 48`.
4. Optionally set a restricted `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
5. Place the source data in `Dataset/`, then run:

   ```bash
   pnpm check:dataset
   pnpm import:dataset
   pnpm dev
   ```

## 10. Verification

Repository-level checks:

```bash
pnpm check:dataset
npx tsc --noEmit --incremental false
pnpm build
npm audit --omit=dev --audit-level=high
git diff --check
```

After configuring Supabase and Cloudinary, test with designated test accounts: citizen submits an image-backed report; admin sees and assigns it; contractor sees only that assignment and submits completion evidence; admin requests rework and later approves; the citizen cannot fetch completion photos before approval and can afterward. Attempt cross-citizen and unassigned-contractor reads and confirm they are denied.

## 11. Limitations and next steps

- Shared passwords and non-verified user identifiers are not production authentication.
- UI refresh is polling (admin every five seconds; citizen/contractor every ten seconds), not realtime subscriptions.
- Historical imported complaints have no Cloudinary photo assets; source IDs are preserved.
- No automated end-to-end test environment for Supabase and Cloudinary is configured.
- Production readiness requires verified authentication, rate limiting, abuse controls, stronger audit/monitoring, backups/recovery tests, formal data retention/deletion, and explicit handling of user consent.
