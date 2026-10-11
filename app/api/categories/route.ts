import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const snapshot = await firestore().collection('categories').get()
    const categories = snapshot.docs.map((document) => ({
      categoryId: document.id,
      label: document.data().label || '',
    })).filter((category) => category.label).sort((left, right) => left.label.localeCompare(right.label))
    return NextResponse.json(categories)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Complaint categories could not be loaded.' }, { status: 503 })
  }
}
