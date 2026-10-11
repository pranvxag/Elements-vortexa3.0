import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase-types'

let serviceClient: ReturnType<typeof createClient<Database>> | undefined

export function supabaseAdmin() {
  if (serviceClient) return serviceClient
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase server access is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }
  serviceClient = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return serviceClient
}
