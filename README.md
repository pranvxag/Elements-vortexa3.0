# GovFix Civic

GovFix Civic is a Next.js, React, and TypeScript application for submitting municipal complaints and managing assignment, field work, review, and resolution. Supabase Postgres is the shared database; Cloudinary stores report and completion photographs as authenticated assets. Browser requests go through the application API.

## Run locally

Requirements: Node.js 20 or newer and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configure Supabase and Cloudinary

1. Use the existing Supabase project or create one. In Project Settings, copy the Project URL and a server-only `service_role` key (or secret key).
2. In Supabase SQL Editor, run [supabase/schema.sql](./supabase/schema.sql). It creates the complaint workflow tables, transaction RPCs, and restrictive RLS settings. It also adds the new workflow columns to the earlier GovFix complaints table without deleting its existing records.
3. Create a Cloudinary account and find its cloud name, API key, and API secret in its dashboard.
4. Set these values in `.env.local`:

   ```dotenv
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<server-only service-role key>
   SESSION_SECRET=a-random-secret-with-at-least-32-characters
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   CITIZEN_PASSWORD=pass123
   STAFF_PASSWORD=admin
   ```

   Keep the Supabase service-role key, session secret, and Cloudinary API secret private. Do not put any of them in a `NEXT_PUBLIC_` variable. Generate a unique session secret with `openssl rand -base64 48`.
5. Keep the supplied records in the ignored, local-only `Dataset/` folder. The importer expects `govfix_complaints_v2.csv`, `govfix_contractors.csv`, and one `govfix_officers*.xlsx` file. Validate the files without connecting to Supabase:

   ```bash
   pnpm check:dataset
   ```

6. Import the records once:

   ```bash
   pnpm import:dataset
   ```

   This seeds `complaints`, `complaint_updates`, `contractors`, `admins`, `categories`, and `dataset_imports` in Supabase. Complaint rows retain the supplied tracking IDs and citizen mobile numbers. Re-running after successful import is intentionally refused so workflow changes are not overwritten; complaint IDs that already exist are skipped.

Cloudinary stores report and completion photos as authenticated assets. The application proxies downloads through an authorization-checked API and uses short-lived Cloudinary download signatures; completion photos become visible to citizens only after admin approval. Uploads accept JPEG, PNG, and WebP, up to 10 images of 10 MB each.

## Sign-in and workflow

- Citizen: mobile number and `CITIZEN_PASSWORD` (defaults to `pass123`).
- Admin: an email found in the imported officer workbook and `STAFF_PASSWORD` (defaults to `admin`).
- Contractor: a mobile number found in the imported contractor CSV and `STAFF_PASSWORD`.

The defaults match the supplied test credentials. They are shared passwords, not proof that a user owns the supplied mobile number or email. Do not deploy them for production or use real personal data with them; use Supabase Auth with verified identities before production.

Citizens can submit reports and only retrieve reports whose stored citizen mobile matches their signed session. Administrators can review and assign category-matched contractors. Contractors can only retrieve reports assigned to their contractor record, start work, and submit a description and photographs. Administrators can approve work (closing the complaint and publishing completion photos) or request further work with a reason. Each transition and history event is committed atomically through a Postgres RPC. The admin portal checks for changed cases every five seconds; citizen and contractor portals refresh every ten seconds.

## Maps

The administrator map uses Google Maps JavaScript API. Configure `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` with a browser key restricted to your site and with Maps JavaScript API enabled. Without it, complaint management and location coordinates remain available but the interactive map shows a setup message.

## Production build

```bash
pnpm build
pnpm start
```
