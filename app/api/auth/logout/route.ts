import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST() {
  const response = NextResponse.json({ success: true })
  clearSessionCookie(response)
  return response
}
