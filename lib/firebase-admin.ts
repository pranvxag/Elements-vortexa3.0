import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function firebaseApp() {
  const existing = getApps()[0]
  if (existing) return existing

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) {
    throw new Error('Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON.')
  }
  let serviceAccount: { project_id?: string; client_email?: string; private_key?: string }
  try {
    serviceAccount = JSON.parse(serviceAccountJson)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service account JSON.')
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is missing required service account fields.')
  }

  return initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
    }),
  })
}

export function firestore() {
  return getFirestore(firebaseApp())
}
