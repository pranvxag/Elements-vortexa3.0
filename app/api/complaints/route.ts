import { randomUUID } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebase-admin'
import { deletePrivatePhoto, privatePhotoDownloadUrl, uploadPrivatePhoto, type StoredPhoto } from '@/lib/cloudinary'
import { sessionFromRequest, type PortalSession } from '@/lib/session'

export const runtime = 'nodejs'

const maximumImageSize = 10 * 1024 * 1024
const maximumImagesPerReport = 10
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function apiError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function unauthorized() {
  return NextResponse.json({ error: 'Sign in to access complaints.' }, { status: 401 })
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function complaintQuery(session: PortalSession) {
  const collection = firestore().collection('complaints')
  if (session.role === 'citizen') return collection.where('citizenMobile', '==', session.phone)
  if (session.role === 'contractor') return collection.where('contractorId', '==', session.contractorId)
  return collection
}

function photoResult(trackingId: string, photo: StoredPhoto, description = '', publicVisible = false) {
  return {
    url: `/api/complaints/${encodeURIComponent(trackingId)}/photos/${encodeURIComponent(photo.photoId)}`,
    description,
    public: publicVisible,
  }
}

async function complaintResult(snapshot: FirebaseFirestore.DocumentSnapshot, session: PortalSession, includeDetails = false) {
  const data = snapshot.data() || {}
  const canSeePrivate = session.role === 'admin'
    || session.role === 'contractor' && session.contractorId === data.contractorId
    || session.role === 'citizen' && session.phone === data.citizenMobile
  const ownComplaint = session.role === 'admin'
    || session.role === 'contractor' && session.contractorId === data.contractorId
    || session.role === 'citizen' && session.phone === data.citizenMobile
  const photoRecords = Array.isArray(data.completionPhotos) ? data.completionPhotos as Array<StoredPhoto & { description?: string; public?: boolean }> : []
  const photos = canSeePrivate && includeDetails
    ? await Promise.all(photoRecords
      .filter((photo) => session.role !== 'citizen' || photo.public === true)
      .map((photo) => photoResult(snapshot.id, photo, photo.description || '', photo.public === true)))
    : []
  const reportPhotos = Array.isArray(data.reportPhotos) ? data.reportPhotos as StoredPhoto[] : []
  const complaintPhotos = ownComplaint && includeDetails
    ? reportPhotos.map((photo) => photoResult(snapshot.id, photo))
    : []
  const result: Record<string, unknown> = {
    trackingId: snapshot.id,
    title: data.title || '',
    category: data.category || '',
    categoryId: data.categoryId || '',
    details: data.details || '',
    location: data.location || '',
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    completionDescription: data.completionDescription || '',
    area: data.area || data.location || '',
    zoneId: data.zoneId || '',
    zoneName: data.zoneName || '',
    status: data.status || 'Submitted',
    citizenName: session.role === 'admin' || session.role === 'citizen' && session.phone === data.citizenMobile ? data.citizenName || '' : '',
    citizenMobile: session.role === 'admin' ? data.citizenMobile || '' : '',
    contractorId: data.contractorId || '',
    contractorName: data.contractorName || '',
    createdAt: data.createdAt?.toDate?.().toISOString?.() || data.createdAt || '',
    updatedAt: data.updatedAt?.toDate?.().toISOString?.() || data.updatedAt || '',
    photos,
    complaintPhotos,
  }

  if (includeDetails) {
    const eventSnapshot = await snapshot.ref.collection('updates').orderBy('createdAt', 'asc').get()
    result.updates = eventSnapshot.docs.map((event) => {
      const update = event.data()
      return {
        type: update.type || 'update',
        message: update.message || '',
        actorRole: update.actorRole || '',
        actorName: update.actorName || '',
        createdAt: update.createdAt?.toDate?.().toISOString?.() || update.createdAt || '',
      }
    })
  }
  return result
}

export async function GET(request: Request) {
  const session = sessionFromRequest(request)
  if (!session) return unauthorized()
  try {
    const trackingId = new URL(request.url).searchParams.get('id')
    const since = new URL(request.url).searchParams.get('since')
    const collection = firestore().collection('complaints')
    if (trackingId) {
      if (!/^GF-[A-Z0-9-]{1,40}$/i.test(trackingId)) {
        return NextResponse.json({ error: 'Invalid complaint tracking ID.' }, { status: 400 })
      }
      const snapshot = await collection.doc(trackingId).get()
      if (!snapshot.exists) return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 })
      const data = snapshot.data() || {}
      const isAllowed = session.role === 'admin'
        || session.role === 'citizen' && data.citizenMobile === session.phone
        || session.role === 'contractor' && data.contractorId === session.contractorId
      if (!isAllowed) return NextResponse.json({ error: 'You do not have access to this complaint.' }, { status: 403 })
      return NextResponse.json(await complaintResult(snapshot, session, true))
    }

    let query = complaintQuery(session)
    if (since && session.role === 'admin') {
      const sinceTime = Date.parse(since)
      if (!Number.isFinite(sinceTime)) return NextResponse.json({ error: 'Invalid complaint update cursor.' }, { status: 400 })
      query = collection.where('updatedAt', '>=', Timestamp.fromMillis(Math.max(0, sinceTime - 1000)))
    }
    const snapshot = await query.get()
    const records = await Promise.all(snapshot.docs.map((document) => complaintResult(document, session)))
    records.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    return NextResponse.json(records)
  } catch (error) {
    return NextResponse.json({ error: apiError(error, 'The complaints could not be loaded.') }, { status: 503 })
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

  const category = String(form.get('category') || '').trim()
  const categoryId = String(form.get('categoryId') || '').trim()
  const title = String(form.get('title') || '').trim()
  const location = String(form.get('location') || '').trim()
  const details = String(form.get('details') || '').trim()
  const latitude = Number(form.get('latitude'))
  const longitude = Number(form.get('longitude'))
  const area = String(form.get('area') || location).trim()
  const zoneId = String(form.get('zoneId') || '').trim()
  const zoneName = String(form.get('zoneName') || '').trim()
  const files = form.getAll('images').filter((value): value is File => value instanceof File && value.size > 0)

  if (!category || !title || title.length > 160 || details.length > 4000
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return NextResponse.json({ error: 'Category, a title (up to 160 characters), and a valid location are required.' }, { status: 400 })
  }
  if (files.length > maximumImagesPerReport) return NextResponse.json({ error: 'You can attach up to 10 images.' }, { status: 400 })
  if (files.some((file) => !allowedImageTypes.has(file.type) || file.size > maximumImageSize)) {
    return NextResponse.json({ error: 'Attachments must be JPEG, PNG, or WebP images no larger than 10 MB each.' }, { status: 400 })
  }
  try {
    const categorySnapshot = await firestore().collection('categories').doc(categoryId).get()
    if (!categorySnapshot.exists || categorySnapshot.data()?.label !== category) {
      return NextResponse.json({ error: 'Choose a valid complaint category.' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json({ error: apiError(error, 'Complaint categories could not be checked.') }, { status: 503 })
  }

  const trackingId = `GF-${new Date().getFullYear()}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`
  const uploadedPhotos: StoredPhoto[] = []
  try {
    for (const [index, file] of files.entries()) {
      const photoId = randomUUID()
      uploadedPhotos.push(await uploadPrivatePhoto(file, photoId, `govfix/${trackingId}/citizen/${photoId}`))
    }

    const complaintRef = firestore().collection('complaints').doc(trackingId)
    const batch = firestore().batch()
    batch.create(complaintRef, {
      trackingId,
      title,
      category,
      categoryId,
      details,
      location,
      area,
      zoneId,
      zoneName,
      latitude,
      longitude,
      citizenName: session.name,
      citizenMobile: normalizePhone(session.phone),
      status: 'Submitted',
      contractorId: '',
      contractorName: '',
      reportPhotos: uploadedPhotos,
      completionPhotos: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    batch.create(complaintRef.collection('updates').doc(), {
      type: 'submitted',
      message: 'Complaint submitted by the citizen.',
      actorRole: 'citizen',
      actorName: session.name,
      createdAt: FieldValue.serverTimestamp(),
    })
    await batch.commit()
    return NextResponse.json({ trackingId }, { status: 201 })
  } catch (error) {
    const cleanup = await Promise.allSettled(uploadedPhotos.map((photo) => deletePrivatePhoto(photo.publicId)))
    const cleanupFailed = cleanup.some((result) => result.status === 'rejected')
    const message = apiError(error, 'The complaint could not be saved.')
    return NextResponse.json({ error: cleanupFailed ? `${message} Uploaded files could not all be cleaned up; contact the system administrator.` : message }, { status: 503 })
  }
}
