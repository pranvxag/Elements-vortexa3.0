# GovFix Civic

A Next.js civic service desk demo for reporting, tracking, and resolving municipal issues.

## Run locally

### Requirements

- Node.js 20 or newer
- pnpm 9 or newer

### Development server

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The development server reloads automatically when files change. Stop it with `Ctrl+C`.

### Production build

```bash
pnpm build
pnpm start
```

The production server is also available at [http://localhost:3000](http://localhost:3000).

## Supabase complaint storage

Complaint submission uses the browser's location permission and stores the coordinates in Supabase. The app requires a Supabase project configured with these environment variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-browser-key
```

Create a `.env.local` file in the project root and add those values. Never use a Supabase service-role key in this project.

Run the complete SQL from [supabase/schema.sql](./supabase/schema.sql) in the Supabase SQL editor. Do not run only the complaints-table portion: the same script also creates the `complaint-images` Storage bucket and its upload policy.

After running it, verify that the SQL was applied in the same Supabase project as `SUPABASE_URL`:

```sql
select id, name, public
from storage.buckets
where id = 'complaint-images';

select to_regclass('public.complaints') as complaints_table;
```

The first query must return one row with `id = complaint-images` and `public = false`. The second must return `public.complaints`. If either query returns no row, select the correct Supabase project before running the complete schema script again.

If the bucket row is still missing, run this bucket-only repair in the SQL editor, followed by the upload policy:

```sql
insert into storage.buckets (id, name, public)
values ('complaint-images', 'complaint-images', false)
on conflict (id) do update
set name = excluded.name, public = excluded.public;

drop policy if exists "Allow public complaint image uploads" on storage.objects;

create policy "Allow public complaint image uploads"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'complaint-images');
```

The browser must be running on `localhost` or HTTPS for geolocation permission to work. Users must explicitly allow location access before a complaint can be submitted.

The complaint form accepts up to 10 images per report, either from the device camera or the photo picker. Each image must be 10 MB or smaller. The schema also creates the private `complaint-images` Storage bucket and its anonymous upload policy.

## Google Maps setup

The staff Map intelligence page uses the Google Maps JavaScript API. Create a browser API key in Google Cloud, enable **Maps JavaScript API**, configure billing as required by Google, and restrict the key to your local site (for example `http://localhost:3000/*` and `http://127.0.0.1:3000/*`). Add it to `.env.local`:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-browser-key
```

Restart `pnpm dev` after changing `.env.local`. Without the key, the map page shows an explicit setup message and the complaint list remains usable.
