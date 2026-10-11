import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextResponse } from 'next/server'

export type PortalRole = 'citizen' | 'admin' | 'contractor'

export type PortalSession = {
  role: PortalRole
  userId: string
  name: string
  phone?: string
  contractorId?: string
  expiresAt: number
}

export const sessionCookieName = 'govfix_session'
const sessionLifetimeSeconds = 60 * 60 * 8

function sessionSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters.')
  }
  return secret
}

function signature(payload: string) {
  return createHmac('sha256', sessionSecret()).update(payload).digest()
}

export function createSessionToken(session: Omit<PortalSession, 'expiresAt'>) {
  const payload = Buffer.from(JSON.stringify({
    ...session,
    expiresAt: Date.now() + sessionLifetimeSeconds * 1000,
  })).toString('base64url')
  return `${payload}.${signature(payload).toString('base64url')}`
}

export function readSessionToken(token: string | undefined): PortalSession | null {
  if (!token) return null
  const [payload, providedSignature, extra] = token.split('.')
  if (!payload || !providedSignature || extra) return null
  const expected = signature(payload)
  try {
    const actual = Buffer.from(providedSignature, 'base64url')
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as PortalSession
    if (!['citizen', 'admin', 'contractor'].includes(session.role)
      || typeof session.userId !== 'string'
      || typeof session.name !== 'string'
      || !Number.isFinite(session.expiresAt)
      || session.expiresAt <= Date.now()) return null
    return session
  } catch {
    return null
  }
}

export function sessionFromRequest(request: Request): PortalSession | null {
  const cookieHeader = request.headers.get('cookie') || ''
  const token = cookieHeader.split(';').map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${sessionCookieName}=`))
    ?.slice(sessionCookieName.length + 1)
  if (!token) return null
  let decodedToken: string
  try {
    decodedToken = decodeURIComponent(token)
  } catch {
    return null
  }
  return readSessionToken(decodedToken)
}

export function setSessionCookie<T>(response: NextResponse<T>, token: string) {
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: sessionLifetimeSeconds,
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
}
