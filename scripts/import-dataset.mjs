import { readdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env.local') })
const datasetDirectory = path.join(root, 'Dataset')
const checkOnly = process.argv.includes('--check')

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
  return parsed.toISOString()
}

function complaintStatus(value) {
  const status = String(value || '').toLowerCase()
  if (status.includes('closed')) return 'Closed'
  if (status.includes('process')) return 'In progress'
  return 'Submitted'
}

async function upsertInBatches(client, table, records, conflictColumn, batchSize = 250) {
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const { error } = await client.from(table).upsert(records.slice(offset, offset + batchSize), { onConflict: conflictColumn })
    if (error) throw error
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
  tracking_id: row.complaint_id,
  citizen_name: row.citizen_name,
  citizen_mobile: normalizedPhone(row.citizen_mobile),
  category_id: row.category_id,
  category: row.category,
  title: row.description.slice(0, 160) || row.category,
  details: row.description,
  area: row.area,
  location: [row.area, row.zone_name, row.city, row.pincode].filter(Boolean).join(', '),
  zone_id: row.zone_id,
  zone_name: row.zone_name,
  city: row.city,
  pincode: row.pincode,
  latitude: numberOrNull(row.latitude),
  longitude: numberOrNull(row.longitude),
  status: complaintStatus(row.status),
  source_status: row.status,
  contractor_id: '',
  contractor_name: '',
  report_photos: [],
  completion_photos: [],
  completion_description: '',
  review_reason: '',
  created_at: createdAt(row.created_at),
  updated_at: createdAt(row.created_at),
  imported_from: 'govfix_complaints_v2',
}))

const contractorRecords = contractorRows.map((row) => ({
  contractor_id: row.contractor_id,
  name: row.name,
  firm_name: row.firm_name,
  category_id: row.category_id,
  category: row.category,
  zone_id: row.zone_id,
  zone_name: row.zone_name,
  service_areas: row.service_areas,
  phone: row.mobile,
  phone_normalized: normalizedPhone(row.mobile),
  email: row.email,
  address: row.address,
  pincode: row.pincode,
  experience_years: numberOrNull(row.experience_years),
  rating: numberOrNull(row.rating),
  active: ['1', 'true', 'yes'].includes(String(row.active).toLowerCase()),
}))

const adminRecords = officerRows.map((row) => ({
  officer_id: String(row['Officer ID'] || row.Username || row.Email).trim(),
  category_id: String(row['Category ID'] || '').trim(),
  category: String(row.Category || '').trim(),
  name: String(row['Officer Name'] || '').trim(),
  username: String(row.Username || '').trim(),
  email: String(row.Email || '').trim(),
  email_normalized: String(row.Email || '').trim().toLowerCase(),
  phone: String(row.Phone || '').trim(),
  phone_normalized: normalizedPhone(row.Phone || ''),
}))

const categoryRecords = [...new Map(complaintRows.map((row) => [row.category_id, {
  category_id: row.category_id,
  label: row.category,
}])).values()]

const trackingIds = new Set(complaints.map((complaint) => complaint.tracking_id))
if (trackingIds.size !== complaints.length || complaints.some((complaint) => !complaint.tracking_id || !complaint.citizen_mobile)) {
  throw new Error('Complaint tracking IDs must be unique and every record must have a tracking ID and citizen mobile.')
}
const contractorPhones = new Set(contractorRecords.map((record) => record.phone_normalized))
const adminEmails = new Set(adminRecords.map((record) => record.email_normalized))
const contractorIds = new Set(contractorRecords.map((record) => record.contractor_id))
const adminIds = new Set(adminRecords.map((record) => record.officer_id))
const validDocumentId = (id) => /^[A-Za-z0-9_-]+$/.test(id)
if (contractorPhones.size !== contractorRecords.length || adminEmails.size !== adminRecords.length
  || contractorIds.size !== contractorRecords.length || adminIds.size !== adminRecords.length
  || contractorRecords.some((record) => !record.phone_normalized || !validDocumentId(record.contractor_id))
  || adminRecords.some((record) => !record.email_normalized || !validDocumentId(record.officer_id))
  || complaints.some((record) => !validDocumentId(record.tracking_id))
  || categoryRecords.some((record) => !validDocumentId(record.category_id))) {
  throw new Error('Dataset identifiers must be present, unique, and database-safe.')
}
if (checkOnly) {
  console.log(`Dataset check passed: ${complaints.length} complaints, ${contractorRecords.length} contractors, ${adminRecords.length} administrators, and ${categoryRecords.length} categories.`)
  process.exit(0)
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!supabaseUrl || !supabaseKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.')
const db = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } })
const { data: importMarker, error: markerError } = await db.from('dataset_imports').select('import_id').eq('import_id', 'govfix-v2').maybeSingle()
if (markerError) throw markerError
if (importMarker) {
  throw new Error('The supplied dataset has already been imported. It was not re-applied, to preserve live complaint updates.')
}

const existing = new Set()
for (let offset = 0; offset < complaints.length; offset += 250) {
  const ids = complaints.slice(offset, offset + 250).map((complaint) => complaint.tracking_id)
  const { data, error } = await db.from('complaints').select('tracking_id').in('tracking_id', ids)
  if (error) throw error
  data.forEach((complaint) => existing.add(complaint.tracking_id))
}
const newComplaints = complaints.filter((complaint) => !existing.has(complaint.tracking_id))

await upsertInBatches(db, 'contractors', contractorRecords, 'contractor_id')
await upsertInBatches(db, 'admins', adminRecords, 'officer_id')
await upsertInBatches(db, 'categories', categoryRecords, 'category_id')
for (let offset = 0; offset < newComplaints.length; offset += 250) {
  const batch = newComplaints.slice(offset, offset + 250)
  const { error } = await db.from('complaints').insert(batch)
  if (error) throw error
  const updates = batch.map((complaint) => ({
    tracking_id: complaint.tracking_id,
    type: 'imported',
    message: 'Complaint imported from the supplied GovFix dataset.',
    actor_role: 'system',
    actor_name: 'Dataset import',
    created_at: complaint.created_at,
  }))
  const { error: updateError } = await db.from('complaint_updates').insert(updates)
  if (updateError) throw updateError
}

const { error: markerInsertError } = await db.from('dataset_imports').insert({
  import_id: 'govfix-v2',
  complaint_count: complaints.length,
  new_complaint_count: newComplaints.length,
  contractor_count: contractorRecords.length,
  admin_count: adminRecords.length,
  category_count: categoryRecords.length,
})
if (markerInsertError) throw markerInsertError
console.log(`Imported ${newComplaints.length} new complaint records (${existing.size} already existed), ${contractorRecords.length} contractors, ${adminRecords.length} administrators, and ${categoryRecords.length} categories.`)
