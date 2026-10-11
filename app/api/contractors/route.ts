import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebase-admin'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = sessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Sign in to access contractors.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Only administrators can view the contractor directory.' }, { status: 403 })
  try {
    const snapshot = await firestore().collection('contractors').get()
    const categoryId = new URL(request.url).searchParams.get('categoryId')
    const contractors = snapshot.docs.map((document) => {
      const data = document.data()
      return {
        contractorId: data.contractorId || document.id,
        name: data.name || '',
        firmName: data.firmName || '',
        category: data.category || '',
        categoryId: data.categoryId || '',
        zoneId: data.zoneId || '',
        zoneName: data.zoneName || '',
        serviceAreas: data.serviceAreas || '',
        rating: data.rating ?? null,
        active: data.active !== false,
      }
    }).filter((contractor) => contractor.active && (!categoryId || contractor.categoryId === categoryId))
    return NextResponse.json(contractors)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The contractor directory could not be loaded.' }, { status: 503 })
  }
}
