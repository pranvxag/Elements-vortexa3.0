# GovFix Civic — Technical Approach

## 1. Purpose and scope

GovFix Civic is a civic complaint application with a public citizen experience and authenticated administration and contractor workspaces. A complaint is created once and stored in Cloud Firestore. The citizen, authorized administrators, and the complaint's assigned contractor use the same complaint record and its update history.

The implementation in this repository is a **Next.js 16 App Router application using React 19 and TypeScript**. It is not a separate Vite frontend plus FastAPI backend. Next.js route handlers provide the server API and use the Firebase Admin SDK to access Firestore. Cloudinary stores complaint and completion images; Firebase Storage is not required.

The system supports this lifecycle:

```text
Citizen submits
  -> Submitted
  -> Admin assigns a category-matched contractor
  -> Assigned
  -> Contractor starts field work
  -> In progress
  -> Contractor submits description and evidence
  -> Work completed
  -> Admin approves -> Closed, completion photos visible to citizen
                 or -> Rework required -> contractor resumes work
```

## 2. Architectural principles

1. **One source of truth:** portals do not maintain separate complaint fixtures. Firestore stores the complaint records, assignment, current status, photo metadata, and event history.
2. **Server-mediated access:** browsers call same-origin Next.js APIs. Firebase Admin credentials and Cloudinary credentials stay on the server and must never use a `NEXT_PUBLIC_` variable.
3. **Role and record scoped access:** API handlers validate the signed-in role and, for citizens and contractors, verify access to the specific complaint before returning data or allowing a mutation.
4. **Auditable transitions:** each meaningful workflow event is appended to the complaint's `updates` subcollection.
5. **Private evidence by default:** Cloudinary images are uploaded as authenticated assets. An authorization-checked application route proxies image downloads; completion photos are not available to citizens until approved.
6. **Dataset import is controlled:** the supplied source records are imported once, preserving tracking IDs while avoiding overwriting complaints that already exist.

## 3. Technology and component boundaries

| Concern | Technology | Responsibility |
|---|---|---|
| Web application and server endpoints | Next.js 16 App Router | Renders the public page and portals; implements same-origin API route handlers |
| UI | React 19, TypeScript, Tailwind CSS | Complaint submission, citizen tracking, admin operations, contractor work queue |
| Authentication session | Node.js crypto HMAC and HttpOnly cookie | Signs role and identity claims; cookie is SameSite=Strict and expires after eight hours |
| Shared operational database | Cloud Firestore via Firebase Admin SDK | Complaints, identity directories, categories, and complaint update history |
| Photo storage | Cloudinary Node SDK | Authenticated report and completion image assets |
| Map display | Google Maps JavaScript API (optional) | Admin map visualization when a restricted browser API key is configured |
| Initial data load | Node.js importer and Python standard-library XLSX reader | Validates and loads supplied CSV/XLSX records into Firestore |

Main implementation locations:

- `app/page.tsx`: public home page, citizen sign-in, complaint creation, and entry points for admin and contractor access.
- `components/portal-workflow.tsx`: citizen, admin, and contractor portal workflows and periodic refresh.
- `app/api/`: server-side authentication, complaint, category, contractor, workflow, and image endpoints.
- `lib/firebase-admin.ts`: server-only Firebase Admin initialization and Firestore access.
- `lib/session.ts`: session token creation, verification, role types, and cookie helpers.
- `lib/cloudinary.ts`: authenticated Cloudinary upload, cleanup, and signed download URL creation.
- `scripts/import-dataset.mjs`: source dataset validation and one-time Firestore import.
- `firestore.rules`: deny-by-default Firestore client rules; application server handlers use Admin SDK permissions.

## 4. Request and data-flow design

### 4.1 Sign-in

`POST /api/auth/login` accepts a role, user ID, and password:

- Citizen IDs are normalized to digits and validated as a 10–15 digit phone number.
- Admin IDs are lowercased and must match an imported `admins.emailNormalized`.
- Contractor IDs are normalized to digits and must match an active imported `contractors.phoneNormalized`.
- The citizen password is read from `CITIZEN_PASSWORD` (default `pass123`); admin and contractor accounts share `STAFF_PASSWORD` (default `admin`).
- A successful login returns a signed session cookie. The cookie is HttpOnly, SameSite=Strict, and has an eight-hour lifetime.
- `GET /api/auth/session` returns the current session identity; `POST /api/auth/logout` clears the session cookie.

These shared passwords are a development/testing arrangement, not production-grade identity verification. In particular, knowing a phone number plus the shared citizen password does not prove ownership of that number. Before production use, replace this model with individually verifiable identities (for example Firebase Authentication plus verified phone OTP or email), account recovery, rate limits, and appropriate audit controls.

### 4.2 Complaint submission

1. A signed-in citizen submits category, title, description, location coordinates, address context, and optional images to `POST /api/complaints`.
2. The server validates the citizen session, category record, required fields, coordinates, image count, MIME type, and size.
3. Images are streamed to Cloudinary as `authenticated` image assets under a complaint-specific public ID. The application records only non-secret Cloudinary metadata (`photoId`, `publicId`, format, content type) in Firestore.
4. The server creates the complaint and initial `submitted` update. New identifiers use the `GF-<year>-<random>` form.
5. If the Firestore create fails after an image upload, the API attempts to delete the uploaded Cloudinary objects. A cleanup failure is reported rather than silently ignored.

Images are limited by the API to JPEG, PNG, or WebP, no more than 10 images per submission and no more than 10 MB per image.

### 4.3 Reading complaints

`GET /api/complaints` returns records scoped to the current session:

- Citizens query by their normalized `citizenMobile`.
- Contractors query by their `contractorId`.
- Administrators can query all records and use the `since` cursor for incremental refresh.

`GET /api/complaints?id=<trackingId>` returns the detail/history for one complaint only after the handler verifies that the session is an admin, the matching citizen, or the assigned contractor. Citizen responses do not reveal private completion evidence or another citizen's private data.

The admin portal polls for changes every five seconds; citizen and contractor portals refresh every ten seconds. These are polling intervals, not a Firestore realtime listener.

### 4.4 Assignment and contractor work

- Admins retrieve the contractor directory from `GET /api/contractors`. The directory route is admin-only and filters by active state and, where supplied, category.
- `POST /api/complaints/[trackingId]/assign` requires the admin role, an active contractor, and a matching complaint category when both records specify one. A Firestore transaction updates the complaint and appends an assignment event.
- `POST /api/complaints/[trackingId]/status` allows only the assigned contractor to move an `Assigned` or `Rework required` complaint to `In progress`.
- `POST /api/complaints/[trackingId]/completion` accepts the work description and completion images from the assigned contractor. It uploads authenticated assets, then uses a Firestore transaction to move the complaint to `Work completed` and append the event.

### 4.5 Review and closure

`POST /api/complaints/[trackingId]/review` is admin-only and accepts either:

- `approve`: mark the photos public, move the complaint to `Closed`, and append an approval event; or
- `reject` (request rework): require a reason, keep photos private to staff, move the complaint to `Rework required`, and append a rework event containing the reason.

The contractor can restart work on a complaint marked `Rework required` and submit updated evidence after completion.

### 4.6 Photo authorization and delivery

The client receives same-origin photo paths, not Cloudinary credentials or permanent asset URLs. `GET /api/complaints/[trackingId]/photos/[photoId]`:

1. Requires a valid session.
2. Loads the complaint and verifies the requester is its citizen, assigned contractor, or an admin.
3. Finds the requested photo in the complaint's persisted metadata.
4. For a citizen requesting completion evidence, requires `public === true`.
5. Obtains a short-lived signed Cloudinary download URL and proxies the image with a private/no-store cache policy.

This route prevents unauthorized API access but cannot prevent an authorized user from saving or redistributing an image after viewing it. Review privacy, retention, and consent requirements before real-world deployment.

## 5. Firestore data model

| Collection | Document ID | Important fields |
|---|---|---|
| `complaints` | Complaint tracking ID | `trackingId`, `title`, `details`, `categoryId`, `category`, location/coordinates, `citizenName`, `citizenMobile`, `status`, `contractorId`, `contractorName`, `reportPhotos`, `completionPhotos`, `completionDescription`, timestamps, import metadata |
| `complaints/{trackingId}/updates` | Auto-generated event ID | `type`, `message`, `actorRole`, `actorName`, `createdAt` |
| `contractors` | Dataset contractor ID | Contractor identity, normalized phone, service category, zone, service areas, active flag |
| `admins` | Officer ID or source identity | Name, email and `emailNormalized`, officer/category information |
| `categories` | Source category ID | `label` |
| `datasetImports` | `govfix-v2` marker | Import timestamp and input/import counts; prevents accidental repeat import |

Statuses currently used by the application include `Submitted`, `Assigned`, `In progress`, `Work completed`, `Rework required`, and `Closed`. Imported source statuses are normalized to the supported initial statuses. Each application workflow transition updates `updatedAt` and adds an event in the same transaction when applicable.

The importer seeds historical complaints without uploading historical photos; imported complaint records have an empty `reportPhotos` array. Dataset contents are local input and are not committed to the repository.

## 6. Security model and production gaps

### Current protections

- Firebase Admin and Cloudinary secrets are consumed only in server-side modules.
- Firestore client security rules deny direct reads/writes.
- API routes enforce a signed role and validate ownership/assignment before complaint access and mutations.
- Sessions use an HMAC signature, HttpOnly cookie, SameSite=Strict, expiration, and timing-safe signature comparison.
- Photo assets use Cloudinary authenticated delivery, and photo reads are mediated through an access-checked endpoint.
- Dataset files and `.env*.local` are ignored by Git.

### Required before production

1. **Rotate the service-account key previously shared in chat.** Treat it as compromised; revoke it in Google Cloud IAM and configure a replacement locally. Never commit or paste the replacement into chat.
2. Replace shared role passwords and caller-supplied citizen phone authentication with verified, individual user identities.
3. Add login and mutation rate limiting, abuse monitoring, and stronger brute-force protections.
4. Review Cloudinary authenticated delivery settings and account-level controls; keep credentials server-side and rotate them if exposed.
5. Define data retention/deletion and image consent policies for personally identifiable location and contact data.
6. Configure backups, Firestore indexes needed by production query patterns, monitoring, alerting, and tested recovery procedures.
7. Restrict the Google Maps browser key by allowed origins and enabled APIs if the optional map is used.
8. Review service-account IAM permissions and grant only the Firestore access required.

Shared passwords and the lack of identity verification mean the current login should be treated as a demo/test authentication layer and should not protect real civic records in production.

## 7. Local setup and dataset import

Requirements: Node.js 20+, pnpm, Python 3, a Firebase project with Firestore enabled, and Cloudinary credentials for image workflows.

1. Install and initialize the local environment:

   ```bash
   pnpm install
   cp .env.example .env.local
   ```

2. Set the server-side variables in `.env.local`:

   ```dotenv
   FIREBASE_SERVICE_ACCOUNT_JSON=<complete service-account JSON on one line>
   SESSION_SECRET=<unique random value of at least 32 bytes>
   CLOUDINARY_CLOUD_NAME=<cloud name>
   CLOUDINARY_API_KEY=<API key>
   CLOUDINARY_API_SECRET=<API secret>
   CITIZEN_PASSWORD=pass123
   STAFF_PASSWORD=admin
   ```

   The Firebase service-account JSON must contain valid `project_id`, `client_email`, and `private_key` fields. JSON-escaped `\n` in the private key is supported. Keep `.env.local` private and never define server secrets using `NEXT_PUBLIC_` variables. A unique session secret can be generated locally with `openssl rand -base64 48`.

3. For optional Maps support, set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to a browser API key restricted to the deployed origin.
4. Configure Firestore rules from `firestore.rules`. The server uses Firebase Admin and is not restricted by client security rules; authorization therefore depends on the route-handler checks.
5. Place the provided source files in the ignored `Dataset/` directory:
   - `govfix_complaints_v2.csv`
   - `govfix_contractors.csv`
   - exactly one `govfix_officers*.xlsx`
6. Validate the source files locally, without Firebase access:

   ```bash
   pnpm check:dataset
   ```

7. Import into the configured Firestore project:

   ```bash
   pnpm import:dataset
   ```

The import script refuses to re-run if the `datasetImports/govfix-v2` marker exists, to avoid overwriting live workflow data. It skips complaint IDs that already exist. Validate the target project and source files before import; the importer is an initial seed mechanism, not a general-purpose synchronization or migration tool.

Run the app locally:

```bash
pnpm dev
```

Build and run the production server:

```bash
pnpm build
pnpm start
```

## 8. Validation and operational checks

Available project checks:

```bash
pnpm check:dataset
npx tsc --noEmit --incremental false
pnpm build
npm audit --omit=dev --audit-level=high
git diff --check
```

The dataset check validates file presence, data counts, unique identities/IDs, and Firestore-safe document identifiers without printing dataset personal information. A successful build or dataset validation does **not** prove that Firebase or Cloudinary credentials work. After configuring both services, perform an integration smoke test with test accounts:

1. Sign in as a test citizen and submit a complaint with an image.
2. Confirm the complaint appears in the admin portal with its same tracking ID.
3. Assign a category-matched test contractor and confirm it appears only in that contractor's work queue.
4. Start work and submit a description plus evidence photo.
5. Confirm the admin can inspect evidence, request rework with a reason, and later approve it.
6. Confirm the citizen cannot retrieve unapproved completion photos and can retrieve them after closure.
7. Attempt access as a different citizen/contractor and verify access is denied.

## 9. Current limitations and future improvements

- Login passwords are shared across each role and must be replaced before production.
- Polling provides eventual refresh at five- and ten-second intervals; it is not push-based real-time synchronization.
- The supplied dataset has complaint history but may not contain the specific tracking number a user expects. Imported IDs remain unchanged, while newly filed complaints receive generated IDs.
- Initial data import does not create image objects for historical dataset records.
- Photos are limited to JPEG, PNG, and WebP; no server-side image moderation or virus/malware scanning is implemented.
- No automated end-to-end integration suite against Firebase/Cloudinary is configured in this repository.
- Candidate next steps include Firebase Authentication with verified identities, Firestore emulator tests, integration tests for each role boundary, a migration framework, administrative audit reporting, operational observability, and documented retention workflows.
