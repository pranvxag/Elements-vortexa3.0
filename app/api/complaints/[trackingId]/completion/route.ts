import { FieldValue } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebase-admin'
import { deletePrivatePhoto, uploadPrivatePhoto, type StoredPhoto } from '@/lib/cloudinary'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

const maximumImageSize = 10 * 1024 * 1024
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(request: Request, context: { params: Promise<{ trackingId: string }> }) {
  const session = sessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Sign in to upload completion evidence.' }, { status: 401 })
  if (session.role !== 'contractor') return NextResponse.json({ error: 'Only assigned contractors can submit completion evidence.' }, { status: 403 })

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
  const complaintRef = firestore().collection('complaints').doc(trackingId)
  const uploadedPhotos: StoredPhoto[] = []
  try {
    const initial = await complaintRef.get()
    if (!initial.exists) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 })
    if (initial.data()?.contractorId !== session.contractorId) {
      return NextResponse.json({ error: 'This complaint is not assigned to you.' }, { status: 403 })
    }
    if (!['In progress', 'Rework required'].includes(String(initial.data()?.status))) {
      return NextResponse.json({ error: 'Start work before submitting completion evidence.' }, { status: 409 })
    }

    for (const photo of photos) {
      const photoId = randomUUID()
      uploadedPhotos.push(await uploadPrivatePhoto(photo, photoId, `govfix/${trackingId}/completion/${photoId}`))
    }

    await firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(complaintRef)
      if (!snapshot.exists || snapshot.data()?.contractorId !== session.contractorId) {
        throw new Error('Complaint assignment changed before completion could be submitted.')
      }
      if (!['In progress', 'Rework required'].includes(String(snapshot.data()?.status))) {
        throw new Error('The complaint status changed before completion could be submitted.')
      }
      transaction.update(complaintRef, {
        status: 'Work completed',
        completionPhotos: uploadedPhotos.map((photo) => ({ ...photo, description, public: false })),
        completionDescription: description,
        updatedAt: FieldValue.serverTimestamp(),
      })
      transaction.create(complaintRef.collection('updates').doc(), {
        type: 'work_completed',
        message: description,
        actorRole: 'contractor',
        actorName: session.name,
        createdAt: FieldValue.serverTimestamp(),
      })
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    const cleanup = await Promise.allSettled(uploadedPhotos.map((photo) => deletePrivatePhoto(photo.publicId)))
    const message = error instanceof Error ? error.message : 'Completion evidence could not be saved.'
    const cleanupFailed = cleanup.some((result) => result.status === 'rejected')
    return NextResponse.json({ error: cleanupFailed ? `${message} Uploaded files could not all be cleaned up; contact the system administrator.` : message }, { status: 503 })
  }
}
