import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { privatePhotoDownloadUrl, type StoredPhoto } from '@/lib/cloudinary'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ trackingId: string; photoId: string }> }) {
  const session = sessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Sign in to view complaint photos.' }, { status: 401 })
  const { trackingId, photoId } = await context.params
  if (!/^GF-[A-Z0-9-]{1,40}$/i.test(trackingId) || !/^[0-9a-f-]{36}$/i.test(photoId)) {
    return NextResponse.json({ error: 'Invalid photo request.' }, { status: 400 })
  }

  try {
    const { data: complaint, error } = await supabaseAdmin().from('complaints').select('citizen_mobile, contractor_id, report_photos, completion_photos')
      .eq('tracking_id', trackingId).maybeSingle()
    if (error) throw error
    if (!complaint) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 })
    const isOwner = session.role === 'citizen' && session.phone === complaint.citizen_mobile
    const isAssignedContractor = session.role === 'contractor' && session.contractorId === complaint.contractor_id
    const isAdmin = session.role === 'admin'
    if (!isOwner && !isAssignedContractor && !isAdmin) {
      return NextResponse.json({ error: 'You do not have access to this complaint.' }, { status: 403 })
    }

    const reportPhoto = Array.isArray(complaint.report_photos)
      ? (complaint.report_photos as unknown as StoredPhoto[]).find((photo) => photo.photoId === photoId)
      : undefined
    const completionPhoto = Array.isArray(complaint.completion_photos)
      ? (complaint.completion_photos as unknown as Array<StoredPhoto & { public?: boolean }>).find((photo) => photo.photoId === photoId)
      : undefined
    if (!reportPhoto && !completionPhoto) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })
    if (completionPhoto && session.role === 'citizen' && completionPhoto.public !== true) {
      return NextResponse.json({ error: 'This completion photo is not public yet.' }, { status: 403 })
    }

    const photo = reportPhoto || completionPhoto!
    const response = await fetch(privatePhotoDownloadUrl(photo), { cache: 'no-store', redirect: 'error' })
    if (!response.ok || !response.body) {
      return NextResponse.json({ error: 'Photo storage could not return the requested image.' }, { status: 502 })
    }
    return new Response(response.body, {
      headers: {
        'Content-Type': photo.contentType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Photo storage request failed.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
