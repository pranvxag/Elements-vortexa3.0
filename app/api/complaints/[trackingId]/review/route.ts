import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Json } from '@/lib/supabase-types'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ trackingId: string }> }) {
  const session = sessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Sign in to review work.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Only administrators can review completed work.' }, { status: 403 })

  let body: { decision?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid work review.' }, { status: 400 })
  }
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return NextResponse.json({ error: 'Choose approve or request further work.' }, { status: 400 })
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (body.decision === 'reject' && (reason.length < 5 || reason.length > 2000)) {
    return NextResponse.json({ error: 'Provide a reason for further work (5 to 2,000 characters).' }, { status: 400 })
  }

  try {
    const { trackingId } = await context.params
    const db = supabaseAdmin()
    const { data: complaint, error: readError } = await db.from('complaints')
      .select('status, completion_photos').eq('tracking_id', trackingId).maybeSingle()
    if (readError) throw readError
    if (!complaint) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 })
    if (complaint.status !== 'Work completed') {
      return NextResponse.json({ error: 'Only completed work can be reviewed.' }, { status: 409 })
    }
    const approved = body.decision === 'approve'
    const completionPhotos = Array.isArray(complaint.completion_photos)
      ? complaint.completion_photos.map((photo) => ({ ...(photo as Record<string, Json>), public: approved }))
      : []
    const { error } = await db.rpc('transition_complaint', {
      p_tracking_id: trackingId,
      p_expected_statuses: ['Work completed'],
      p_new_status: approved ? 'Closed' : 'Rework required',
      p_patch: {
        completion_photos: completionPhotos,
        review_reason: approved ? '' : reason,
      } as Json,
      p_event_type: approved ? 'approved' : 'rework_requested',
      p_message: approved ? 'Work approved. Complaint closed.' : `Further work requested: ${reason}`,
      p_actor_role: 'admin',
      p_actor_name: session.name,
    })
    if (error) throw error
    return NextResponse.json({ success: true, status: approved ? 'Closed' : 'Rework required' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The work could not be reviewed.'
    const status = message.includes('not found') ? 404 : message.includes('status changed') ? 409 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
