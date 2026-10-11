import { NextResponse } from 'next/server'
import { sessionFromRequest } from '@/lib/session'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const session = sessionFromRequest(request)
    if (!session) return NextResponse.json({ user: null }, { status: 200 })
    const { expiresAt: _expiresAt, ...user } = session
    return NextResponse.json({ user })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The authentication service is unavailable.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
