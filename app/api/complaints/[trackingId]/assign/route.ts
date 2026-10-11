import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Json } from '@/lib/supabase-types'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ trackingId: string }> }) {
  const session = sessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Sign in to assign complaints.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Only administrators can assign complaints.' }, { status: 403 })

  let body: { contractorId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid assignment request.' }, { status: 400 })
  }
  if (typeof body.contractorId !== 'string' || !body.contractorId.trim()) {
    return NextResponse.json({ error: 'Select an active contractor.' }, { status: 400 })
  }
  try {
    const { trackingId } = await context.params
    const db = supabaseAdmin()
    const [{ data: complaint, error: complaintError }, { data: contractor, error: contractorError }] = await Promise.all([
      db.from('complaints').select('category_id, status').eq('tracking_id', trackingId).maybeSingle(),
      db.from('contractors').select('contractor_id, name, firm_name, category_id, active').eq('contractor_id', body.contractorId).maybeSingle(),
    ])
    if (complaintError) throw complaintError
    if (contractorError) throw contractorError
    if (!complaint) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 })
    if (!contractor || !contractor.active) return NextResponse.json({ error: 'The selected contractor is not active.' }, { status: 400 })
    if (complaint.status === 'Closed' || complaint.status === 'Work completed') {
      return NextResponse.json({ error: 'Closed or review-pending complaints cannot be reassigned.' }, { status: 409 })
    }
    if (complaint.category_id && contractor.category_id && complaint.category_id !== contractor.category_id) {
      return NextResponse.json({ error: 'Choose a contractor whose service category matches this complaint.' }, { status: 409 })
    }
    const { error } = await db.rpc('transition_complaint', {
      p_tracking_id: trackingId,
      p_expected_statuses: ['Submitted', 'Assigned', 'In progress', 'Rework required'],
      p_new_status: 'Assigned',
      p_patch: { contractor_id: contractor.contractor_id, contractor_name: contractor.name } as Json,
      p_event_type: 'assigned',
      p_message: `Assigned to ${contractor.name || 'a contractor'}${contractor.firm_name ? ` (${contractor.firm_name})` : ''}.`,
      p_actor_role: 'admin',
      p_actor_name: session.name,
    })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The complaint could not be assigned.'
    const status = message.includes('not found') ? 404 : message.includes('status changed') ? 409 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
