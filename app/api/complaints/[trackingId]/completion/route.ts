import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { deletePrivatePhoto, uploadPrivatePhoto, type StoredPhoto } from '@/lib/cloudinary'
import type { Json } from '@/lib/supabase-types'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

const maximumImageSize = 10 * 1024 * 1024
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(request: Request, context: { params: Promise<{ trackingId: string }> }) {
  const session = sessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Sign in to upload completion evidence.' }, { status: 401 })
  if (session.role !== 'contractor' || !session.contractorId) {
    return NextResponse.json({ error: 'Only assigned contractors can submit completion evidence.' }, { status: 403 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid completion submission.' }, { status: 400 })
  }
  const description = String(form.get('description') || '').trim()
  const photos = form.getAll('photos').filter((value): value is File => value instanceof File && value.size > 0)
  if (description.length < 5 || description.length > 2000) {
    return NextResponse.json({ error: 'Describe the completed work in 5 to 2,000 characters.' }, { status: 400 })
  }
  if (photos.length < 1 || photos.length > 10 || photos.some((photo) => !allowedImageTypes.has(photo.type) || photo.size > maximumImageSize)) {
    return NextResponse.json({ error: 'Upload 1 to 10 JPEG, PNG, or WebP images, each no larger than 10 MB.' }, { status: 400 })
  }

  const { trackingId } = await context.params
  const uploadedPhotos: StoredPhoto[] = []
  try {
    const db = supabaseAdmin()
    const { data: complaint, error: readError } = await db.from('complaints')
      .select('contractor_id, status').eq('tracking_id', trackingId).maybeSingle()
    if (readError) throw readError
    if (!complaint) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 })
    if (complaint.contractor_id !== session.contractorId) {
      return NextResponse.json({ error: 'This complaint is not assigned to you.' }, { status: 403 })
    }
    if (!['In progress', 'Rework required'].includes(complaint.status)) {
      return NextResponse.json({ error: 'Start work before submitting completion evidence.' }, { status: 409 })
    }

    for (const photo of photos) {
      const photoId = randomUUID()
      uploadedPhotos.push(await uploadPrivatePhoto(photo, photoId, `govfix/${trackingId}/completion/${photoId}`))
    }

    const { error } = await db.rpc('transition_complaint', {
      p_tracking_id: trackingId,
      p_expected_statuses: [complaint.status],
      p_new_status: 'Work completed',
      p_patch: {
        completion_photos: uploadedPhotos.map((photo) => ({ ...photo, description, public: false })) as unknown as Json,
        completion_description: description,
      },
      p_event_type: 'work_completed',
      p_message: description,
      p_actor_role: 'contractor',
      p_actor_name: session.name,
      p_required_contractor_id: session.contractorId,
    })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    const cleanup = await Promise.allSettled(uploadedPhotos.map((photo) => deletePrivatePhoto(photo.publicId)))
    const message = error instanceof Error ? error.message : 'Completion evidence could not be saved.'
    const cleanupFailed = cleanup.some((result) => result.status === 'rejected')
    const status = message.includes('not assigned') ? 403 : message.includes('status changed') ? 409 : 503
    return NextResponse.json({
      error: cleanupFailed ? `${message} Uploaded files could not all be cleaned up; contact the system administrator.` : message,
    }, { status })
  }
}
