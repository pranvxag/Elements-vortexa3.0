import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().from('categories').select('category_id, label').order('label')
    if (error) throw error
    const categories = data.map((category) => ({
      categoryId: category.category_id,
      label: category.label,
    }))
    return NextResponse.json(categories)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Complaint categories could not be loaded.' }, { status: 503 })
  }
}
