import { NextResponse } from 'next/server'
import { firestore } from '@/lib/firebase-admin'
import { createSessionToken, setSessionCookie, type PortalRole } from '@/lib/session'

export const runtime = 'nodejs'

function normalizedPhone(value: string) {
  return value.replace(/\D/g, '')
}

function passwordsMatch(provided: unknown, expected: string) {
  return typeof provided === 'string' && provided === expected
}

export async function POST(request: Request) {
  let body: { role?: unknown; userId?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid login request.' }, { status: 400 })
  }

  const role = body.role
  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  if (!['citizen', 'admin', 'contractor'].includes(String(role)) || !userId || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'Enter a valid user ID and password.' }, { status: 400 })
  }

  const selectedRole = role as PortalRole
  const requiredPassword = selectedRole === 'citizen'
    ? (process.env.CITIZEN_PASSWORD || 'pass123')
    : (process.env.STAFF_PASSWORD || 'admin')
  if (!passwordsMatch(body.password, requiredPassword)) {
    return NextResponse.json({ error: 'The user ID or password is incorrect.' }, { status: 401 })
  }

  let identity: { userId: string; name: string; phone?: string; contractorId?: string }
  try {
    if (selectedRole === 'citizen') {
      const phone = normalizedPhone(userId)
      if (phone.length < 10 || phone.length > 15) {
        return NextResponse.json({ error: 'Enter a valid mobile number.' }, { status: 400 })
      }
      identity = { userId: phone, phone, name: `Citizen · ${phone.slice(-4)}` }
    } else if (selectedRole === 'admin') {
      const email = userId.toLowerCase()
      const result = await firestore().collection('admins').where('emailNormalized', '==', email).limit(1).get()
      if (result.empty) return NextResponse.json({ error: 'The user ID or password is incorrect.' }, { status: 401 })
      const admin = result.docs[0].data()
      identity = { userId: email, name: typeof admin.name === 'string' ? admin.name : 'Administrator' }
    } else {
      const phone = normalizedPhone(userId)
      const result = await firestore().collection('contractors').where('phoneNormalized', '==', phone).limit(1).get()
      if (result.empty) return NextResponse.json({ error: 'The user ID or password is incorrect.' }, { status: 401 })
      const contractor = result.docs[0].data()
      if (contractor.active === false) return NextResponse.json({ error: 'This contractor account is inactive.' }, { status: 403 })
      identity = {
        userId: typeof contractor.contractorId === 'string' ? contractor.contractorId : result.docs[0].id,
        contractorId: typeof contractor.contractorId === 'string' ? contractor.contractorId : result.docs[0].id,
        phone,
        name: typeof contractor.name === 'string' ? contractor.name : 'Contractor',
      }
    }

    const token = createSessionToken({ role: selectedRole, ...identity })
    const response = NextResponse.json({ user: { role: selectedRole, ...identity } })
    setSessionCookie(response, token)
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The sign-in service is unavailable.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
