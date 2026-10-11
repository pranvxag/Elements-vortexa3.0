import { FieldValue } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebase-admin'
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
    const db = firestore()
    const complaintRef = db.collection('complaints').doc(trackingId)
    const contractorSnapshot = await db.collection('contractors').doc(body.contractorId).get()
    if (!contractorSnapshot.exists || contractorSnapshot.data()?.active === false) {
      return NextResponse.json({ error: 'The selected contractor is not active.' }, { status: 400 })
    }
    const contractor = contractorSnapshot.data()!
    await db.runTransaction(async (transaction) => {
      const complaintSnapshot = await transaction.get(complaintRef)
      if (!complaintSnapshot.exists) throw new Error('Complaint not found.')
      const complaint = complaintSnapshot.data()!
      if (complaint.status === 'Closed' || complaint.status === 'Work completed') {
        throw new Error('Closed or review-pending complaints cannot be reassigned.')
      }
      if (complaint.categoryId && contractor.categoryId && complaint.categoryId !== contractor.categoryId) {
        throw new Error('Choose a contractor whose service category matches this complaint.')
      }
      transaction.update(complaintRef, {
        contractorId: contractor.contractorId || contractorSnapshot.id,
        contractorName: contractor.name || '',
        status: 'Assigned',
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.create(complaintRef.collection('updates').doc(), {
        type: 'assigned',
        message: `Assigned to ${contractor.name || 'a contractor'}${contractor.firmName ? ` (${contractor.firmName})` : ''}.`,
        actorRole: 'admin',
        actorName: session.name,
        createdAt: FieldValue.serverTimestamp(),
      })
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The complaint could not be assigned.'
    const status = message === 'Complaint not found.' ? 404 : message.startsWith('Choose a contractor') || message.includes('cannot be reassigned') ? 409 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
