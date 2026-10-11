import { readdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const datasetDirectory = path.join(root, 'Dataset')
const checkOnly = process.argv.includes('--check')
const serviceAccountText = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
let db

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') quoted = false
      else value += character
    } else if (character === '"' && value.length === 0) quoted = true
    else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value)
      if (row.some((cell) => cell.length)) rows.push(row)
      row = []
      value = ''
    } else value += character
  }
  if (value.length || row.length) {
    row.push(value)
    if (row.some((cell) => cell.length)) rows.push(row)
  }
  const [header, ...records] = rows
  if (!header?.length) throw new Error('The complaints CSV has no header row.')
  return records.map((cells) => Object.fromEntries(header.map((field, index) => [field.trim(), (cells[index] || '').trim()])))
}

function normalizedPhone(value) {
  return String(value || '').replace(/\D/g, '')
}

function numberOrNull(value) {
  if (value === '' || value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function createdAt(value) {
  const parsed = new Date(String(value).replace(' ', 'T') + (String(value).endsWith('Z') ? '' : 'Z'))
  if (!Number.isFinite(parsed.getTime())) throw new Error('A complaint record contains an invalid created_at timestamp.')
  return Timestamp.fromDate(parsed)
}

function complaintStatus(value) {
  const status = String(value || '').toLowerCase()
  if (status.includes('closed')) return 'Closed'
  if (status.includes('process')) return 'In progress'
  return 'Submitted'
}

async function writeInBatches(records, write, batchSize = 400) {
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = db.batch()
    for (const record of records.slice(offset, offset + batchSize)) write(batch, record)
    await batch.commit()
  }
}

const files = await readdir(datasetDirectory)
const complaintFile = path.join(datasetDirectory, 'govfix_complaints_v2.csv')
const contractorFile = path.join(datasetDirectory, 'govfix_contractors.csv')
const officerFiles = files.filter((file) => file.startsWith('govfix_officers') && file.toLowerCase().endsWith('.xlsx'))
if (!files.includes(path.basename(complaintFile)) || !files.includes(path.basename(contractorFile)) || officerFiles.length !== 1) {
  throw new Error('Dataset/ must contain govfix_complaints_v2.csv, govfix_contractors.csv, and exactly one govfix_officers .xlsx file.')
}

const complaintRows = parseCsv(await readFile(complaintFile, 'utf8'))
const contractorRows = parseCsv(await readFile(contractorFile, 'utf8'))
const officerRows = JSON.parse(execFileSync('python3', [path.join(root, 'scripts/read-officer-workbook.py'), path.join(datasetDirectory, officerFiles[0])], { encoding: 'utf8' }))
if (!complaintRows.length || !contractorRows.length || !officerRows.length) throw new Error('One or more dataset files contain no records.')

const complaints = complaintRows.map((row) => ({
  id: row.complaint_id,
  data: {
    trackingId: row.complaint_id,
    citizenName: row.citizen_name,
    citizenMobile: normalizedPhone(row.citizen_mobile),
    categoryId: row.category_id,
    category: row.category,
    title: row.description.slice(0, 160) || row.category,
    details: row.description,
    area: row.area,
    location: [row.area, row.zone_name, row.city, row.pincode].filter(Boolean).join(', '),
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    city: row.city,
    pincode: row.pincode,
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    status: complaintStatus(row.status),
    sourceStatus: row.status,
    contractorId: '',
    contractorName: '',
    reportPhotos: [],
    completionPhotos: [],
    createdAt: createdAt(row.created_at),
    updatedAt: createdAt(row.created_at),
    importedFrom: 'govfix_complaints_v2',
  },
}))

const contractorRecords = contractorRows.map((row) => ({
  id: row.contractor_id,
  data: {
    contractorId: row.contractor_id,
    name: row.name,
    firmName: row.firm_name,
    categoryId: row.category_id,
    category: row.category,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    serviceAreas: row.service_areas,
    phone: row.mobile,
    phoneNormalized: normalizedPhone(row.mobile),
    email: row.email,
    address: row.address,
    pincode: row.pincode,
    experienceYears: numberOrNull(row.experience_years),
    rating: numberOrNull(row.rating),
    active: ['1', 'true', 'yes'].includes(String(row.active).toLowerCase()),
  },
}))

const adminRecords = officerRows.map((row) => ({
  id: String(row['Officer ID'] || row.Username || row.Email).trim(),
  data: {
    officerId: String(row['Officer ID'] || '').trim(),
    categoryId: String(row['Category ID'] || '').trim(),
    category: String(row.Category || '').trim(),
    name: String(row['Officer Name'] || '').trim(),
    username: String(row.Username || '').trim(),
    email: String(row.Email || '').trim(),
    emailNormalized: String(row.Email || '').trim().toLowerCase(),
    phone: String(row.Phone || '').trim(),
    phoneNormalized: normalizedPhone(row.Phone || ''),
  },
}))

const categoryRecords = [...new Map(complaintRows.map((row) => [row.category_id, {
  id: row.category_id,
  label: row.category,
}])).values()]

const trackingIds = new Set(complaints.map((complaint) => complaint.id))
if (trackingIds.size !== complaints.length || complaints.some((complaint) => !complaint.id || !complaint.data.citizenMobile)) {
  throw new Error('Complaint tracking IDs must be unique and every record must have a tracking ID and citizen mobile.')
}
const contractorPhones = new Set(contractorRecords.map((record) => record.data.phoneNormalized))
const adminEmails = new Set(adminRecords.map((record) => record.data.emailNormalized))
const contractorIds = new Set(contractorRecords.map((record) => record.id))
const adminIds = new Set(adminRecords.map((record) => record.id))
const validDocumentId = (id) => /^[A-Za-z0-9_-]+$/.test(id)
if (contractorPhones.size !== contractorRecords.length || adminEmails.size !== adminRecords.length
  || contractorIds.size !== contractorRecords.length || adminIds.size !== adminRecords.length
  || contractorRecords.some((record) => !record.data.phoneNormalized || !validDocumentId(record.id))
  || adminRecords.some((record) => !record.data.emailNormalized || !validDocumentId(record.id))
  || complaints.some((record) => !validDocumentId(record.id))
  || categoryRecords.some((record) => !validDocumentId(record.id))) {
  throw new Error('Dataset document IDs and login identifiers must be present, unique, and Firestore-safe.')
}
if (checkOnly) {
  console.log(`Dataset check passed: ${complaints.length} complaints, ${contractorRecords.length} contractors, ${adminRecords.length} administrators, and ${categoryRecords.length} categories.`)
  process.exit(0)
}

if (!serviceAccountText) throw new Error('Set FIREBASE_SERVICE_ACCOUNT_JSON before importing.')
if (getApps().length === 0) {
  const account = JSON.parse(serviceAccountText)
  initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key?.replace(/\\n/g, '\n'),
    }),
  })
}
db = getFirestore()
const importRef = db.collection('datasetImports').doc('govfix-v2')
if ((await importRef.get()).exists) {
  throw new Error('The supplied dataset has already been imported. It was not re-applied, to preserve live complaint updates.')
}

const existing = new Set()
for (let offset = 0; offset < complaints.length; offset += 400) {
  const refs = complaints.slice(offset, offset + 400).map((complaint) => db.collection('complaints').doc(complaint.id))
  const snapshots = await db.getAll(...refs)
  snapshots.forEach((snapshot) => { if (snapshot.exists) existing.add(snapshot.id) })
}
const newComplaints = complaints.filter((complaint) => !existing.has(complaint.id))

await writeInBatches(contractorRecords, (batch, record) => {
  batch.set(db.collection('contractors').doc(record.id), record.data, { merge: true })
})
await writeInBatches(adminRecords, (batch, record) => {
  batch.set(db.collection('admins').doc(record.id), record.data, { merge: true })
})
await writeInBatches(categoryRecords, (batch, record) => {
  batch.set(db.collection('categories').doc(record.id), record, { merge: true })
})
await writeInBatches(newComplaints, (batch, record) => {
  const complaintRef = db.collection('complaints').doc(record.id)
  batch.create(complaintRef, record.data)
  batch.create(complaintRef.collection('updates').doc(), {
    type: 'imported',
    message: 'Complaint imported from the supplied GovFix dataset.',
    actorRole: 'system',
    actorName: 'Dataset import',
    createdAt: record.data.createdAt,
  }, 250)
})

await importRef.set({
  importedAt: FieldValue.serverTimestamp(),
  complaintCount: complaints.length,
  newComplaintCount: newComplaints.length,
  contractorCount: contractorRecords.length,
  adminCount: adminRecords.length,
  categoryCount: categoryRecords.length,
})
console.log(`Imported ${newComplaints.length} new complaint records (${existing.size} already existed), ${contractorRecords.length} contractors, ${adminRecords.length} administrators, and ${categoryRecords.length} categories.`)
