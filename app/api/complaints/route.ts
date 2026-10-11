import { NextResponse } from 'next/server'

type ComplaintRequest = {
  complaintDomain?: unknown
  category?: unknown
  title?: unknown
  location?: unknown
  details?: unknown
  latitude?: unknown
  longitude?: unknown
}

const complaintDomains = [
  'Roads & Potholes',
  'Streetlights & Electrical',
  'Garbage & Cleanliness',
  'Water Supply',
  'Drainage & Sewage',
  'Public Toilets & Sanitation',
  'Construction & Encroachment',
  'Waterlogging & Flooding',
  'Parks & Public Spaces',
] as const

const complaintSelect = 'id,tracking_id,category,title,location_text,details,status,created_at'

function isMissingDomainColumn(error: { code?: string; message?: string } | null) {
  return error?.code === '42703' && error.message?.includes('complaint_domain')
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'The complaint database is not configured.' }, { status: 503 })
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/complaints?select=id,tracking_id,complaint_domain,category,title,location_text,details,status,created_at&order=created_at.desc`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, cache: 'no-store' },
  )
  if (!response.ok) {
    const upstreamError = await response.json().catch(() => null) as { code?: string; message?: string } | null
    if (isMissingDomainColumn(upstreamError)) {
      const legacyResponse = await fetch(
        `${supabaseUrl.replace(/\/$/, '')}/rest/v1/complaints?select=${complaintSelect}&order=created_at.desc`,
        { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }, cache: 'no-store' },
      )
      if (legacyResponse.ok) {
        const records = await legacyResponse.json() as Array<{ category: string } & Record<string, unknown>>
        return NextResponse.json(records.map((record) => ({
          ...record,
          complaint_domain: complaintDomains.includes(record.category as typeof complaintDomains[number]) ? record.category : null,
        })))
      }
    }
    console.error('Supabase complaint read failed', response.status, { code: upstreamError?.code, message: upstreamError?.message })
    return NextResponse.json({ error: 'Complaints could not be loaded. Check the Supabase table and read policy.' }, { status: 502 })
  }
  return NextResponse.json(await response.json())
}

const trackingId = () => `GF-${Math.floor(10000 + Math.random() * 90000)}`

const supabaseHeaders = (supabaseKey: string, extra: Record<string, string> = {}) => ({
  apikey: supabaseKey,
  Authorization: `Bearer ${supabaseKey}`,
  ...extra,
})

async function supabaseError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { message?: string; error?: string; code?: string }
    const message = body.message || body.error || ''
    if (body.code === 'PGRST205' || body.code === '42P01' || message.toLowerCase().includes('relation') && message.toLowerCase().includes('complaints')) {
      return 'The Supabase complaints table is missing in the configured project. Run the complete supabase/schema.sql in that project\'s SQL editor.'
    }
    if (body.code === '42501') return 'Supabase rejected the request because an insert, read, or upload policy is missing. Run supabase/schema.sql in the Supabase SQL editor.'
    if (body.code === 'NoSuchBucket' || message.toLowerCase().includes('bucket not found') || message.toLowerCase().includes('bucket') && message.toLowerCase().includes('missing')) {
      return `The Supabase complaint-images bucket is missing in ${process.env.SUPABASE_URL}. Run the complete supabase/schema.sql in that Supabase project's SQL editor.`
    }
    return message ? `${fallback} (${message})` : fallback
  } catch {
    return fallback
  }
}

function configuration() {
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY }
}

export async function POST(request: Request) {
  const { url: supabaseUrl, key: supabaseKey } = configuration()
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'The complaint database is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY.' }, { status: 503 })
  }

  let body: ComplaintRequest
  let files: File[] = []
  try {
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData()
      body = {
        category: form.get('category'),
        title: form.get('title'),
        location: form.get('location'),
        details: form.get('details'),
        latitude: Number(form.get('latitude')),
        longitude: Number(form.get('longitude')),
      }
      files = form.getAll('images').filter((value): value is File => value instanceof File)
    } else {
      body = await request.json() as ComplaintRequest
    }
  } catch {
    return NextResponse.json({ error: 'Invalid complaint payload.' }, { status: 400 })
  }

  const category = typeof body.category === 'string' ? body.category.trim() : ''
  const complaintDomain = typeof body.complaintDomain === 'string' ? body.complaintDomain.trim() : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const location = typeof body.location === 'string' ? body.location.trim() : ''
  const details = typeof body.details === 'string' ? body.details.trim() : ''
  const latitude = typeof body.latitude === 'number' ? body.latitude : NaN
  const longitude = typeof body.longitude === 'number' ? body.longitude : NaN
  if (!category || !complaintDomains.includes(complaintDomain as typeof complaintDomains[number]) || !title || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Complaint domain, category, title, and a valid live location are required.' }, { status: 400 })
  }

  const id = trackingId()
  const imagePaths: string[] = []
  for (const [index, file] of files.entries()) {
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Only image files can be uploaded.' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Each image must be 10 MB or smaller.' }, { status: 400 })
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const path = `${id}/${index + 1}-${crypto.randomUUID()}.${extension}`
    const upload = await fetch(`${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/complaint-images/${path}`, {
      method: 'POST',
      headers: supabaseHeaders(supabaseKey, { 'Content-Type': file.type, 'x-upsert': 'false' }),
      body: await file.arrayBuffer(),
      cache: 'no-store',
    })
    if (!upload.ok) return NextResponse.json({ error: await supabaseError(upload, 'The complaint images could not be uploaded.') }, { status: 502 })
    imagePaths.push(path)
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/complaints`, {
    method: 'POST',
    headers: supabaseHeaders(supabaseKey, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify({ tracking_id: id, category, title, location_text: location || null, details: details || null, latitude, longitude, image_paths: imagePaths, status: 'Submitted' }),
    cache: 'no-store',
  })
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response, 'The complaint could not be saved.') }, { status: 502 })
  return NextResponse.json({ trackingId: id }, { status: 201 })
}

export async function GET() {
  const { url: supabaseUrl, key: supabaseKey } = configuration()
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'The complaint database is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY.' }, { status: 503 })
  }
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/complaints?select=id,tracking_id,category,title,location_text,details,latitude,longitude,status,created_at&order=created_at.desc`, {
    headers: supabaseHeaders(supabaseKey),
    cache: 'no-store',
  })
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response, 'The complaints could not be loaded.') }, { status: 502 })
  return NextResponse.json(await response.json())
}
