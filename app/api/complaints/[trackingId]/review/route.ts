import { FieldValue } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebase-admin'
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
    const complaintRef = firestore().collection('complaints').doc(trackingId)
    await firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(complaintRef)
      if (!snapshot.exists) throw new Error('Complaint not found.')
      const complaint = snapshot.data()!
      if (complaint.status !== 'Work completed') throw new Error('Only completed work can be reviewed.')
      const approved = body.decision === 'approve'
      const completionPhotos = Array.isArray(complaint.completionPhotos)
        ? complaint.completionPhotos.map((photo: { photoId: string; publicId: string; format: string; contentType: string; description?: string }) => ({ ...photo, public: approved }))
        : []
      transaction.update(complaintRef, {
        status: approved ? 'Closed' : 'Rework required',
        completionPhotos,
        reviewReason: approved ? '' : reason,
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.create(complaintRef.collection('updates').doc(), {
        type: approved ? 'approved' : 'rework_requested',
        message: approved ? 'Work approved. Complaint closed.' : `Further work requested: ${reason}`,
        actorRole: 'admin',
        actorName: session.name,
        createdAt: FieldValue.serverTimestamp(),
      })
    })
    return NextResponse.json({ success: true, status: body.decision === 'approve' ? 'Closed' : 'Rework required' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The work could not be reviewed.'
    const status = message === 'Complaint not found.' ? 404 : message.startsWith('Only completed') ? 409 : 503
    return NextResponse.json({ error: message }, { status })
  }
}
