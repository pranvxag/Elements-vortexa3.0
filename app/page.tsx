'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Building2,
  Check,
  Droplets,
  FileText,
  Lightbulb,
  LocateFixed,
  MapPin,
  MessageSquareText,
  Navigation,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import {
  AdminDashboard,
  CitizenDashboard,
  ContractorDashboard,
  LoginScreen,
  type PortalRole,
  type PortalUser,
} from '../components/portal-workflow'

type Category = { categoryId: string; label: string }

function PublicHome({ user, onLogin, onTrack, onCreated, openFormOnEnter, onFormOpened }: {
  user: PortalUser | null
  onLogin: (role: PortalRole) => void
  onTrack: () => void
  onCreated: () => void
  openFormOnEnter: boolean
  onFormOpened: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [submitted, setSubmitted] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryError, setCategoryError] = useState('')

type Status = 'Submitted' | 'Under review' | 'Assigned' | 'In progress' | 'Resolved'
type ComplaintDomain = 'Roads & Potholes' | 'Streetlights & Electrical' | 'Garbage & Cleanliness' | 'Water Supply' | 'Drainage & Sewage' | 'Public Toilets & Sanitation' | 'Construction & Encroachment' | 'Waterlogging & Flooding' | 'Parks & Public Spaces'
const complaintDomains: ComplaintDomain[] = [
  'Roads & Potholes',
  'Streetlights & Electrical',
  'Garbage & Cleanliness',
  'Water Supply',
  'Drainage & Sewage',
  'Public Toilets & Sanitation',
  'Construction & Encroachment',
  'Waterlogging & Flooding',
  'Parks & Public Spaces',
]

type Complaint = {
  id: string
  title: string
  category: string
  status: Status
  area: string
  department: string
  age: string
  priority?: 'High' | 'Medium' | 'Low'
  domain?: ComplaintDomain | 'Uncategorized'
  details?: string
  submittedAt?: string
  assignedOfficer?: string
  trackingId?: string
  icon: typeof Droplets
  latitude: number
  longitude: number
}

type ComplaintRecord = {
  tracking_id: string
  category: string
  title: string
  location_text: string | null
  details: string | null
  latitude: number
  longitude: number
  status: string
  created_at: string
}

const departmentFor = (category: string) => {
  const value = category.toLowerCase()
  if (value.includes('water') || value.includes('drain') || value.includes('sewage')) return 'Water & Utilities'
  if (value.includes('garbage') || value.includes('sanitation') || value.includes('collection')) return 'Sanitation'
  if (value.includes('light')) return 'Street Services'
  return 'Public Works'
}

const iconFor = (category: string) => {
  const value = category.toLowerCase()
  if (value.includes('water') || value.includes('drain') || value.includes('sewage')) return Droplets
  if (value.includes('light')) return Lightbulb
  if (value.includes('garbage') || value.includes('sanitation') || value.includes('collection')) return Trash2
  return Navigation
}

const ageFor = (createdAt: string) => {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 3600000))
  return hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

const complaintFromRecord = (record: ComplaintRecord): Complaint => ({
  id: record.tracking_id,
  title: record.title,
  category: record.category,
  status: (['Submitted', 'Under review', 'Assigned', 'In progress', 'Resolved'].includes(record.status) ? record.status : 'Submitted') as Status,
  area: record.location_text || `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`,
  department: departmentFor(record.category),
  age: ageFor(record.created_at),
  priority: record.status === 'Submitted' ? 'High' : record.status === 'Resolved' ? 'Low' : 'Medium',
  icon: iconFor(record.category),
  latitude: record.latitude,
  longitude: record.longitude,
})

function mapSavedComplaint(record: SavedComplaintRecord): Complaint {
  const domain = complaintDomains.includes(record.complaint_domain as ComplaintDomain)
    ? record.complaint_domain as ComplaintDomain
    : 'Uncategorized'
  const validStatuses: Status[] = ['Submitted', 'Under review', 'Assigned', 'In progress', 'Resolved']
  const status = validStatuses.includes(record.status as Status) ? record.status as Status : 'Submitted'
  const icon = domain === 'Water Supply' ? Droplets
    : domain === 'Streetlights & Electrical' ? Lightbulb
      : domain === 'Garbage & Cleanliness' ? Trash2
        : domain === 'Roads & Potholes' ? Navigation : MapPin

  return {
    id: String(record.id),
    trackingId: record.tracking_id,
    title: record.title,
    category: record.category,
    domain,
    status,
    area: record.location_text ?? '',
    department: '—',
    age: new Date(record.created_at).toLocaleString(),
    submittedAt: record.created_at,
    details: record.details ?? undefined,
    icon,
  }
}

const navItems = [
  { label: 'Overview', icon: BarChart3 },
  { label: 'Complaints', icon: FileText },
  { label: 'Complaints by Domain', icon: ListFilter },
  { label: 'Map intelligence', icon: MapPin },
  { label: 'Departments', icon: Building2 },
]

  const startComplaint = () => {
    if (!user) {
      onLogin('citizen')
      return
    }
    setSubmitted('')
    setShowForm(true)
  }

  const issueIcons = [Navigation, Droplets, Trash2, Lightbulb, Building2]

  return <div className="citizen-shell">
    <header className="public-header"><a href="/" aria-label="GovFix Civic home"><Brand /></a><nav><a href="#how">How it works</a><a href="#services">Civic services</a><a href="#portals">Government portals</a></nav>
      <div className="header-actions">{user ? <><button className="text-button" onClick={onTrack}>My complaints <ArrowRight /></button><button className="button button-outline small" onClick={startComplaint}>Submit a report</button></> : <><button className="text-button" onClick={() => onLogin('citizen')}>Citizen sign in <ArrowRight /></button><button className="button button-dark small" onClick={startComplaint}>Submit a complaint</button></>}</div>
    </header>
    <main>
      <section className="hero-section"><div className="hero-copy"><div className="eyebrow"><span className="pulse" /> Civic service desk</div><h1>Your city.<br /><span>Your voice.</span><br />Your solution.</h1><p>Report a local issue, follow every update, and see the resolution from your city team.</p><div className="hero-actions"><button className="button button-primary" onClick={startComplaint}>Register a complaint <ArrowRight /></button><button className="button button-ghost" onClick={onTrack}>Track my complaint</button></div><div className="trust-row"><span className="trust-mark"><ShieldCheck /></span><span><strong>One shared case record.</strong> Visible progress from submission to resolution.</span></div></div></section>
      <section className="portal-login-options" id="portals"><div className="section-heading"><div><span className="eyebrow">Portal sign in</span><h2>Choose your portal</h2></div><p>Sign in to follow your report or manage city service work.</p></div><div className="portal-option-grid"><button className="portal-option" onClick={() => onLogin('citizen')}><span className="portal-option-icon"><UserRound /></span><span><strong>Login as a Citizen</strong><small>Submit complaints and track progress and resolution.</small></span><ArrowRight /></button><button className="portal-option" onClick={() => onLogin('contractor')}><span className="portal-option-icon contractor"><Building2 /></span><span><strong>Login as a Contractor</strong><small>See assigned work orders and submit completion evidence.</small></span><ArrowRight /></button><button className="portal-option" onClick={() => onLogin('admin')}><span className="portal-option-icon"><ShieldCheck /></span><span><strong>Login as Admin</strong><small>Review reports, assign contractors, and approve work.</small></span><ArrowRight /></button></div></section>
      <section className="public-workflow-strip"><div><span className="step-number">01</span><MessageSquareText /><strong>Submit</strong><small>Share your issue and its location.</small></div><div><span className="step-number">02</span><Building2 /><strong>Assigned</strong><small>Your city assigns the right contractor.</small></div><div><span className="step-number">03</span><Check /><strong>Resolved</strong><small>Review updates through final approval.</small></div></section>
      <section className="issues-section" id="services"><div className="section-heading"><div><span className="eyebrow">Connected city services</span><h2>What needs attention?</h2></div><button className="arrow-link" onClick={startComplaint}>Report an issue <ArrowRight /></button></div>
        {categoryError && <p className="category-load-error" role="status">{categoryError}</p>}
        <div className="issue-grid">{categories.slice(0, 9).map((category, index) => { const Icon = issueIcons[index % issueIcons.length]; return <button key={category.categoryId} className="issue-card" onClick={startComplaint}><span className={`issue-icon ${['green', 'blue', 'orange', 'purple'][index % 4]}`}><Icon /></span><span><strong>{category.label}</strong><small>Submit and track reports</small></span><ArrowRight /></button> })}</div>
        {categories.length === 0 && !categoryError && <p className="category-load-error">Service categories will appear here when the dataset has been imported.</p>}
      </section>
      <section className="public-cta" id="how"><div><span className="eyebrow">From report to resolution</span><h2>Track the work every step of the way.</h2><p>Citizens see their own reports. Contractors see assigned work. Admins review and approve the final result.</p></div><button className="button button-light" onClick={onTrack}>View my complaints <ArrowRight /></button></section>
    </main>
    <footer className="public-footer"><Brand /><span>GovFix Civic · Public service complaint portal</span><button onClick={() => onLogin('citizen')}>Citizen sign in</button></footer>
    {showForm && <ComplaintForm categories={categories} user={user!} submitted={submitted} onSubmit={(trackingId) => { setSubmitted(trackingId); onCreated() }} onClose={() => { setShowForm(false); setSubmitted('') }} />}
  </div>
}

function Brand() {
  return <span className="brand"><span className="brand-mark"><ShieldCheck /></span><span>GovFix <em>Civic</em></span></span>
}

function ComplaintForm({ categories, user, submitted, onSubmit, onClose }: {
  categories: Category[]
  user: PortalUser
  submitted: string
  onSubmit: (trackingId: string) => void
  onClose: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [details, setDetails] = useState('')
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null)
  const [images, setImages] = useState<File[]>([])
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedCategory = categories.find((category) => category.categoryId === categoryId)

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not supported by this browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setCoordinates({ latitude: coords.latitude, longitude: coords.longitude }); setError('') },
      () => setError('Allow location access, then try again. A valid location is required.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedCategory || !coordinates || !consent) {
      setError('Select a valid category, share your location, and confirm the report details.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const form = new FormData()
      form.append('categoryId', selectedCategory.categoryId)
      form.append('category', selectedCategory.label)
      form.append('title', title.trim())
      form.append('location', location.trim())
      form.append('area', location.trim())
      form.append('details', details.trim())
      form.append('latitude', String(coordinates.latitude))
      form.append('longitude', String(coordinates.longitude))
      form.append('citizenName', user.name)
      images.forEach((image) => form.append('images', image))
      const response = await fetch('/api/complaints', { method: 'POST', body: form })
      const result = await response.json() as { trackingId?: string; error?: string }
      if (!response.ok || !result.trackingId) throw new Error(result.error || 'The complaint could not be submitted.')
      onSubmit(result.trackingId)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'The complaint could not be submitted.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onClick={onClose}><div className="complaint-modal" role="dialog" aria-modal="true" aria-labelledby="complaint-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>
    {submitted ? <div className="success-state"><span className="success-icon"><Check /></span><span className="eyebrow">Complaint submitted</span><h2 id="complaint-title">Your report is saved.</h2><p>Keep this tracking ID to find your private progress updates.</p><div className="tracking-code">{submitted}<button aria-label="Copy tracking ID" onClick={() => navigator.clipboard?.writeText(submitted)}><FileText /></button></div><button className="button button-primary" onClick={onClose}>Done</button></div>
      : <><span className="eyebrow">Citizen report</span><h2 id="complaint-title">What needs attention?</h2><p className="modal-intro">This report will be saved to the shared city complaint register.</p><form className="citizen-complaint-form" onSubmit={submit}>
        <label>Issue category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.label}</option>)}</select></label>
        <label>Complaint title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required placeholder="Briefly describe the issue" /></label>
        <label>Area or landmark<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Neighborhood, street, or landmark" /></label>
        <button className={`location-button ${coordinates ? 'ready' : ''}`} type="button" onClick={captureLocation}><LocateFixed />{coordinates ? 'Location captured' : 'Use my current location'}</button>
        {coordinates && <small className="location-status">GPS: {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</small>}
        <label>Details<textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} maxLength={4000} placeholder="Describe what happened and what needs repair" /></label>
        <label className="citizen-photo-picker"><span><MapPin /> Attach report photos</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { setImages(Array.from(event.target.files || []).slice(0, 10)); event.currentTarget.value = '' }} /></label><small>{images.length} photo(s) selected. Up to 10 JPEG, PNG, or WebP images, max 10 MB each.</small>
        <label className="consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I confirm this report is accurate and allow the assigned city team to review it.</span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary full" disabled={saving || categories.length === 0}>{saving ? 'Saving complaint...' : 'Submit complaint'} <ArrowRight /></button>
      </form></>}
  </div></div>
}

export default function Page() {
  const [user, setUser] = useState<PortalUser | null>(null)
  const [loginRole, setLoginRole] = useState<PortalRole | null>(null)
  const [screen, setScreen] = useState<'home' | 'citizen'>('home')
  const [sessionLoading, setSessionLoading] = useState(true)
  const [complaintRefresh, setComplaintRefresh] = useState(0)
  const [openFormAfterReturn, setOpenFormAfterReturn] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session', { cache: 'no-store' }).then(async (response) => {
      const result = await response.json() as { user?: PortalUser | null }
      if (!cancelled && result.user) setUser(result.user)
    }).catch(() => {
      if (!cancelled) setUser(null)
    }).finally(() => { if (!cancelled) setSessionLoading(false) })
    return () => { cancelled = true }
  }, [])

  const logout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Could not sign out.')
      setUser(null)
      setLoginRole(null)
      setScreen('home')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not sign out.')
    }
  }

  if (sessionLoading) return <main className="portal-loading"><Brand /><p>Connecting to GovFix Civic...</p></main>
  if (loginRole) return <LoginScreen role={loginRole} onBack={() => setLoginRole(null)} onSuccess={(signedInUser) => {
    setUser(signedInUser)
    setLoginRole(null)
    setScreen(signedInUser.role === 'citizen' ? 'home' : 'home')
  }} />
  if (user?.role === 'admin') return <AdminDashboard user={user} onLogout={() => { void logout() }} onHome={() => { void logout() }} />
  if (user?.role === 'contractor') return <ContractorDashboard user={user} onLogout={() => { void logout() }} onHome={() => { void logout() }} />
  if (user?.role === 'citizen' && screen === 'citizen') return <CitizenDashboard user={user} onLogout={() => { void logout() }} onHome={(openForm = false) => {
    setScreen('home')
    setOpenFormAfterReturn(openForm)
  }} refreshKey={complaintRefresh} />

  return <PublicHome user={user} openFormOnEnter={openFormAfterReturn} onFormOpened={() => setOpenFormAfterReturn(false)} onLogin={setLoginRole} onTrack={() => {
    if (!user) setLoginRole('citizen')
    else setScreen('citizen')
  }} onCreated={() => setComplaintRefresh((value) => value + 1)} />
}

function Kpi({ title, value, change, icon: Icon, tone, warning }: { title: string; value: string; change: string; icon: typeof Check; tone: string; warning?: boolean }) { return <div className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon /></div><div className="kpi-label">{title}<span className={warning ? 'negative' : 'positive'}>{warning ? '↑ ' : '↑ '}{change}</span></div><strong>{value}</strong><small>vs. previous month</small></div> }
function Activity({ initials, color, text, time }: { initials: string; color: string; text: string; time: string }) { return <div className="activity-item"><span className={`activity-avatar ${color}`}>{initials}</span><p><strong>{text.split(' ').slice(0, 2).join(' ')}</strong> {text.split(' ').slice(2).join(' ')}<small>{time}</small></p></div> }
function CasePanel({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
  const [opened, setOpened] = useState(false)
  return <div className="case-overlay"><aside className="case-panel"><div className="case-top"><div><span className="eyebrow">Complaint details</span><h2>{complaint.trackingId ?? complaint.id}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X /></button></div><div className="case-status"><StatusBadge status={complaint.status} />{complaint.priority && <span className="priority-tag"><span /> {complaint.priority} priority</span>}</div><h3>{complaint.title}</h3>{complaint.domain && <p className="case-domain">Complaint Domain: {complaint.domain}</p>}<p className="case-description">{complaint.details || 'No additional description provided.'}</p><div className="case-meta"><span><MapPin /> {complaint.area || 'Location not provided'}</span><span><Building2 /> {complaint.assignedOfficer || 'No officer assigned'}</span><span><Clock3 /> Submitted {complaint.submittedAt ? new Date(complaint.submittedAt).toLocaleString() : complaint.age}</span></div>{opened && <p className="case-opened-note" role="status">Full case view opened for {complaint.trackingId ?? complaint.id}.</p>}<button className="button button-primary full" onClick={() => setOpened(true)}>{opened ? 'Case is open' : 'Open full case'} <ArrowRight /></button></aside></div>
}

export default function Page() { const [portal, setPortal] = useState<'citizen' | 'staff'>('citizen'); return <><div className="portal-switcher"><button className={portal === 'citizen' ? 'selected' : ''} onClick={() => setPortal('citizen')}><House /> Citizen portal</button><button className={portal === 'staff' ? 'selected' : ''} onClick={() => setPortal('staff')}><BarChart3 /> Staff workspace</button></div>{portal === 'citizen' ? <CitizenLanding onEmployee={() => setPortal('staff')} /> : <EmployeeDashboard onCitizen={() => setPortal('citizen')} />}</> }
