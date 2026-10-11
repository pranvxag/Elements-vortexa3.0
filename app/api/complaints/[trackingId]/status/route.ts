import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ trackingId: string }> }) {
  const session = sessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Sign in to update complaints.' }, { status: 401 })
  if (session.role !== 'contractor' || !session.contractorId) {
    return NextResponse.json({ error: 'Only assigned contractors can update this status.' }, { status: 403 })
  }

  try {
    const { trackingId } = await context.params
    const db = supabaseAdmin()
    const { data: complaint, error: readError } = await db.from('complaints')
      .select('contractor_id, status').eq('tracking_id', trackingId).maybeSingle()
    if (readError) throw readError
    if (!complaint) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 })
    if (complaint.contractor_id !== session.contractorId) {
      return NextResponse.json({ error: 'This complaint is not assigned to you.' }, { status: 403 })
    }
    if (!['Assigned', 'Rework required'].includes(complaint.status)) {
      return NextResponse.json({ error: 'Only assigned complaints or complaints needing rework can be started.' }, { status: 409 })
    }
    const rework = complaint.status === 'Rework required'
    const { error } = await db.rpc('transition_complaint', {
      p_tracking_id: trackingId,
      p_expected_statuses: [complaint.status],
      p_new_status: 'In progress',
      p_patch: {},
      p_event_type: 'in_progress',
      p_message: rework ? 'Further work started after admin feedback.' : 'Contractor started work on site.',
      p_actor_role: 'contractor',
      p_actor_name: session.name,
      p_required_contractor_id: session.contractorId,
    })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The complaint status could not be updated.'
    const status = message.includes('not found') ? 404 : message.includes('not assigned') ? 403 : message.includes('status changed') ? 409 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
