# GovFix Civic

GovFix Civic is the existing Next.js, React, and TypeScript application for submitting municipal complaints and managing their assignment, field work, review, and resolution. Firestore is the shared database; Cloudinary stores report and completion photographs as authenticated assets. The browser does not access either service directly.

## Run locally

Requirements: Node.js 20 or newer and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configure Firebase

1. Create or select a Firebase project and enable Cloud Firestore.
2. Create a service account with permission to read and write Firestore.
3. Create a Cloudinary account and find the cloud name, API key, and API secret in its dashboard.
4. Set these values in `.env.local`:

   ```dotenv
   FIREBASE_SERVICE_ACCOUNT_JSON=<paste the complete service account JSON on one line>
   SESSION_SECRET=a-random-secret-with-at-least-32-characters
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   CITIZEN_PASSWORD=pass123
   STAFF_PASSWORD=admin
   ```

   Keep all secrets private. Generate a unique session secret, for example with `openssl rand -base64 48`. Do not use a service-account key or Cloudinary API secret in any `NEXT_PUBLIC_` variable.
5. Deploy [firestore.rules](./firestore.rules), which deny direct client access; authenticated server API routes use the Firebase Admin SDK and enforce citizen, contractor, and administrator permissions.
6. Keep the supplied records in the ignored, local-only `Dataset/` folder. The importer expects `govfix_complaints_v2.csv`, `govfix_contractors.csv`, and one `govfix_officers*.xlsx` file. Validate the files without connecting to Firebase:

   ```bash
   pnpm check:dataset
   ```

7. Import the records once:

   ```bash
   pnpm import:dataset
   ```

   This seeds `complaints`, `contractors`, `admins`, `categories`, and `datasetImports` in Firestore. Complaint documents retain the supplied tracking IDs and citizen mobile numbers. Re-running the import is intentionally refused so that previously imported workflow changes are not overwritten. Existing complaint IDs are skipped if already present.

Cloudinary stores report and completion photos as authenticated assets. The application proxies photo downloads through an authorization-checked API and uses short-lived Cloudinary download signatures; completion photos become visible to the citizen only after an administrator approves the work. Uploads accept JPEG, PNG, and WebP images, up to 10 images of 10 MB each.

## Sign-in and workflow

- Citizen: mobile number and `CITIZEN_PASSWORD` (defaults to `pass123`).
- Admin: an email found in the imported officer workbook and `STAFF_PASSWORD` (defaults to `admin`).
- Contractor: a mobile number found in the imported contractor CSV and `STAFF_PASSWORD`.

The defaults match the supplied test credentials. They are shared passwords, not proof that a user owns the supplied mobile number or email. Do not deploy them for production or use real personal data with them; use Firebase Authentication with verified identities before production.

Citizens can submit reports and only retrieve reports whose stored citizen mobile matches their signed session. Administrators can review and assign category-matched contractors. Contractors can only retrieve reports assigned to their contractor record, start work, and submit a description and photographs. Administrators can approve work (closing the complaint and publishing completion photos) or request further work with a reason. Each transition is written to the complaint's `updates` subcollection; the admin portal checks for changed cases every five seconds and citizen/contractor portals refresh every ten seconds.

## Maps

The administrator map uses Google Maps JavaScript API. Configure `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with a browser key restricted to your site and with Maps JavaScript API enabled. Without it, complaint management and location coordinates remain available but the interactive map shows a setup message.

## Production build

```bash
pnpm build
pnpm start
```
