import { FieldValue } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebase-admin'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ trackingId: string }> }) {
  const session = sessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Sign in to update complaints.' }, { status: 401 })
  if (session.role !== 'contractor') return NextResponse.json({ error: 'Only assigned contractors can update this status.' }, { status: 403 })

  try {
    const { trackingId } = await context.params
    const complaintRef = firestore().collection('complaints').doc(trackingId)
    await firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(complaintRef)
      if (!snapshot.exists) throw new Error('Complaint not found.')
      const complaint = snapshot.data()!
      if (complaint.contractorId !== session.contractorId) throw new Error('This complaint is not assigned to you.')
      if (!['Assigned', 'Rework required'].includes(complaint.status)) {
        throw new Error('Only assigned complaints or complaints needing rework can be started.')
      }
      transaction.update(complaintRef, { status: 'In progress', updatedAt: FieldValue.serverTimestamp() })
      transaction.create(complaintRef.collection('updates').doc(), {
        type: 'in_progress',
        message: complaint.status === 'Rework required' ? 'Further work started after admin feedback.' : 'Contractor started work on site.',
        actorRole: 'contractor',
        actorName: session.name,
        createdAt: FieldValue.serverTimestamp(),
      })
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The complaint status could not be updated.'
    const status = message === 'Complaint not found.' ? 404 : message.startsWith('This complaint') || message.startsWith('Only assigned') ? 403 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
