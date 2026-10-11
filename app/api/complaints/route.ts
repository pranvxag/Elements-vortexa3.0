import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { deletePrivatePhoto, uploadPrivatePhoto, type StoredPhoto } from '@/lib/cloudinary'
import type { ComplaintRow, Json } from '@/lib/supabase-types'
import { sessionFromRequest, type PortalSession } from '@/lib/session'

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

function photoResult(trackingId: string, photo: StoredPhoto, description = '', publicVisible = false) {
  return {
    url: `/api/complaints/${encodeURIComponent(trackingId)}/photos/${encodeURIComponent(photo.photoId)}`,
    description,
    public: publicVisible,
  }
}

function complaintResult(row: ComplaintRow, session: PortalSession, includeDetails = false) {
  const canSeePrivate = session.role === 'admin'
    || session.role === 'contractor' && session.contractorId === row.contractor_id
    || session.role === 'citizen' && session.phone === row.citizen_mobile
  const ownComplaint = canSeePrivate
  const completionPhotos = Array.isArray(row.completion_photos) ? row.completion_photos as unknown as Array<StoredPhoto & { description?: string; public?: boolean }> : []
  const photos = canSeePrivate && includeDetails
    ? completionPhotos
      .filter((photo) => session.role !== 'citizen' || photo.public === true)
      .map((photo) => photoResult(row.tracking_id, photo, photo.description || '', photo.public === true))
    : []
  const reportPhotos = Array.isArray(row.report_photos) ? row.report_photos as unknown as StoredPhoto[] : []
  const complaintPhotos = ownComplaint && includeDetails
    ? reportPhotos.map((photo) => photoResult(row.tracking_id, photo))
    : []
  return {
    trackingId: row.tracking_id,
    title: row.title,
    category: row.category,
    categoryId: row.category_id,
    details: row.details,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    completionDescription: row.completion_description,
    area: row.area || row.location,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    status: row.status,
    citizenName: session.role === 'admin' || session.role === 'citizen' && session.phone === row.citizen_mobile ? row.citizen_name : '',
    citizenMobile: session.role === 'admin' ? row.citizen_mobile : '',
    contractorId: row.contractor_id,
    contractorName: row.contractor_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos,
    complaintPhotos,
  }
}

export async function GET(request: Request) {
  const session = sessionFromRequest(request)
  if (!session) return unauthorized()
  try {
    const url = new URL(request.url)
    const trackingId = url.searchParams.get('id')
    const since = url.searchParams.get('since')
    const client = supabaseAdmin()
    if (trackingId) {
      if (!/^GF-[A-Z0-9-]{1,40}$/i.test(trackingId)) {
        return NextResponse.json({ error: 'Invalid complaint tracking ID.' }, { status: 400 })
      }
      const { data: row, error } = await client.from('complaints').select('*').eq('tracking_id', trackingId).maybeSingle()
      if (error) throw error
      if (!row) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 })
      const isAllowed = session.role === 'admin'
        || session.role === 'citizen' && row.citizen_mobile === session.phone
        || session.role === 'contractor' && row.contractor_id === session.contractorId
      if (!isAllowed) return NextResponse.json({ error: 'You do not have access to this complaint.' }, { status: 403 })

      const { data: updates, error: updateError } = await client.from('complaint_updates')
        .select('type, message, actor_role, actor_name, created_at')
        .eq('tracking_id', trackingId).order('created_at', { ascending: true })
      if (updateError) throw updateError
      return NextResponse.json({
        ...complaintResult(row, session, true),
        updates: updates.map((update) => ({
          type: update.type,
          message: update.message,
          actorRole: update.actor_role,
          actorName: update.actor_name,
          createdAt: update.created_at,
        })),
      })
    }

    let query = client.from('complaints').select('*')
    if (session.role === 'citizen') query = query.eq('citizen_mobile', session.phone || '')
    if (session.role === 'contractor') query = query.eq('contractor_id', session.contractorId || '')
    if (since && session.role === 'admin') {
      const sinceTime = Date.parse(since)
      if (!Number.isFinite(sinceTime)) return NextResponse.json({ error: 'Invalid complaint update cursor.' }, { status: 400 })
      query = query.gte('updated_at', new Date(Math.max(0, sinceTime - 1000)).toISOString())
    }
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data.map((row) => complaintResult(row, session)))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The complaints could not be loaded.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  const session = sessionFromRequest(request)
  if (!session) return unauthorized()
  if (session.role !== 'citizen' || !session.phone) {
    return NextResponse.json({ error: 'Only signed-in citizens can submit a complaint.' }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
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

  if (!category || !categoryId || !title || title.length > 160 || details.length > 4000
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Category, a title (up to 160 characters), and a valid location are required.' }, { status: 400 })
  }
  if (files.length > maximumImagesPerReport) return NextResponse.json({ error: 'You can attach up to 10 images.' }, { status: 400 })
  if (files.some((file) => !allowedImageTypes.has(file.type) || file.size > maximumImageSize)) {
    return NextResponse.json({ error: 'Attachments must be JPEG, PNG, or WebP images no larger than 10 MB each.' }, { status: 400 })
  }

  const uploadedPhotos: StoredPhoto[] = []
  try {
    const client = supabaseAdmin()
    const { data: categoryRecord, error: categoryError } = await client.from('categories')
      .select('label').eq('category_id', categoryId).maybeSingle()
    if (categoryError) throw categoryError
    if (!categoryRecord || categoryRecord.label !== category) {
      return NextResponse.json({ error: 'Choose a valid complaint category.' }, { status: 400 })
    }

    const trackingId = `GF-${new Date().getFullYear()}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`
    for (const file of files) {
      const photoId = randomUUID()
      uploadedPhotos.push(await uploadPrivatePhoto(file, photoId, `govfix/${trackingId}/citizen/${photoId}`))
    }

    const { error } = await client.rpc('create_complaint_with_update', {
      p_actor_name: session.name,
      p_complaint: {
        tracking_id: trackingId,
        title,
        category_id: categoryId,
        category,
        details,
        location,
        area,
        zone_id: zoneId,
        zone_name: zoneName,
        latitude,
        longitude,
        citizen_name: session.name,
        citizen_mobile: normalizePhone(session.phone),
        status: 'Submitted',
        contractor_id: '',
        contractor_name: '',
        report_photos: uploadedPhotos as unknown as Json,
        completion_photos: [],
      },
    })
    if (error) throw error
    return NextResponse.json({ trackingId }, { status: 201 })
  } catch (error) {
    const cleanup = await Promise.allSettled(uploadedPhotos.map((photo) => deletePrivatePhoto(photo.publicId)))
    const message = error instanceof Error ? error.message : 'The complaint could not be saved.'
    const cleanupFailed = cleanup.some((result) => result.status === 'rejected')
    return NextResponse.json({
      error: cleanupFailed ? `${message} Uploaded files could not all be cleaned up; contact the system administrator.` : message,
    }, { status: 503 })
  }
}
