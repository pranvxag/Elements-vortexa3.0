import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const session = sessionFromRequest(request)
  if (!session) return NextResponse.json({ error: 'Sign in to access contractors.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Only administrators can view the contractor directory.' }, { status: 403 })
  try {
    const categoryId = new URL(request.url).searchParams.get('categoryId')
    let query = supabaseAdmin().from('contractors')
      .select('contractor_id, name, firm_name, category, category_id, zone_id, zone_name, service_areas, rating, active')
      .eq('active', true)
    if (categoryId) query = query.eq('category_id', categoryId)
    const { data, error } = await query.order('name')
    if (error) throw error
    const contractors = data.map((contractor) => ({
      contractorId: contractor.contractor_id,
      name: contractor.name,
      firmName: contractor.firm_name,
      category: contractor.category,
      categoryId: contractor.category_id,
      zoneId: contractor.zone_id,
      zoneName: contractor.zone_name,
      serviceAreas: contractor.service_areas,
      rating: contractor.rating,
      active: contractor.active,
    }))
    return NextResponse.json(contractors)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The contractor directory could not be loaded.' }, { status: 503 })
  }
}
