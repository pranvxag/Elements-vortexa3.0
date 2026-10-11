'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Clock3,
  FileText,
  House,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from 'lucide-react'

export type PortalRole = 'citizen' | 'admin' | 'contractor'

export type PortalUser = {
  role: PortalRole
  userId: string
  name: string
  phone?: string
  contractorId?: string
}

type Update = {
  type: string
  message: string
  actorRole: string
  actorName: string
  createdAt: string
}

export type Complaint = {
  trackingId: string
  title: string
  category: string
  categoryId: string
  details: string
  location: string
  area: string
  zoneId: string
  zoneName: string
  latitude: number | null
  longitude: number | null
  status: string
  citizenName: string
  citizenMobile: string
  contractorId: string
  contractorName: string
  completionDescription: string
  createdAt: string
  updatedAt: string
  photos: Photo[]
  complaintPhotos: Photo[]
  updates?: Update[]
}

type Photo = { url: string; description: string; public: boolean }

type Contractor = {
  contractorId: string
  name: string
  firmName: string
  category: string
  categoryId: string
  zoneId: string
  zoneName: string
  serviceAreas: string
  rating: number | null
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init })
  const result = await response.json() as T | { error?: string }
  if (!response.ok) {
    throw new Error(typeof result === 'object' && result !== null && !Array.isArray(result) && 'error' in result
      ? result.error || 'The request could not be completed.'
      : 'The request could not be completed.')
  }
  return result as T
}

function RoleBrand() {
  return <div className="brand"><span className="brand-mark"><ShieldCheck /></span><span>GovFix <em>Civic</em></span></div>
}

function StatusLabel({ status }: { status: string }) {
  const tone = status === 'Closed' ? 'success' : status === 'Work completed' ? 'info' : status === 'Rework required' ? 'warning' : 'neutral'
  return <span className={`status-badge ${tone}`}><span className="status-dot" />{status}</span>
}

function ScreenHeader({ user, title, subtitle, onLogout, onHome }: {
  user: PortalUser
  title: string
  subtitle: string
  onLogout: () => void
  onHome?: () => void
}) {
  return <header className="workflow-header"><RoleBrand /><div className="workflow-header-title"><strong>{title}</strong><span>{subtitle}</span></div><div className="workflow-user"><span className="workflow-user-name"><UserRound />{user.name}</span>{onHome && <button className="button button-outline small" onClick={onHome}><House /> Public portal</button>}<button className="button button-outline small" onClick={onLogout}><LogOut /> Sign out</button></div></header>
}

export function LoginScreen({ role, onBack, onSuccess }: {
  role: PortalRole
  onBack: () => void
  onSuccess: (user: PortalUser) => void
}) {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const title = role === 'citizen' ? 'Citizen sign in' : role === 'admin' ? 'Admin login' : 'Contractor login'
  const identifier = role === 'admin' ? 'Email address' : role === 'contractor' || role === 'citizen' ? 'Mobile number' : 'User ID'

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const result = await requestJson<{ user: PortalUser }>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, userId, password }),
      })
      onSuccess(result.user)
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign in failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="login-screen"><button className="login-back" onClick={onBack}><ArrowLeft /> Back to GovFix</button>
    <section className="login-card"><RoleBrand /><span className="eyebrow">{role} portal</span><h1>{title}</h1><p>{role === 'citizen' ? 'Sign in with your mobile number to submit and follow your complaints.' : 'Use the account details from the supplied GovFix dataset.'}</p>
      <form onSubmit={submit}><label>{identifier}<input autoComplete={role === 'admin' ? 'username' : 'tel'} type={role === 'admin' ? 'email' : 'tel'} value={userId} onChange={(event) => setUserId(event.target.value)} required /></label><label>Password<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary full" disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Sign in'} <ArrowRight /></button></form>
      <small>{role === 'citizen' ? 'Citizen password: pass123' : 'Dataset email/mobile with password: admin'}</small>
    </section>
  </main>
}

function useComplaints(role: PortalRole, refreshKey = 0) {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const lastUpdated = useRef('')
  const complaintRecords = useRef<Complaint[]>([])
  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const isDelta = role === 'admin' && !showLoading && Boolean(lastUpdated.current)
      const query = isDelta ? `?since=${encodeURIComponent(new Date(Math.max(0, Date.parse(lastUpdated.current) - 1000)).toISOString())}` : ''
      const records = await requestJson<Complaint[]>(`/api/complaints${query}`)
      const allRecords = isDelta
        ? [...new Map([...complaintRecords.current, ...records].map((complaint) => [complaint.trackingId, complaint])).values()]
        : records
      allRecords.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      const mostRecentlyUpdated = allRecords.reduce((latest, complaint) => complaint.updatedAt > latest ? complaint.updatedAt : latest, lastUpdated.current)
      if (mostRecentlyUpdated) lastUpdated.current = mostRecentlyUpdated
      complaintRecords.current = allRecords
      setComplaints(allRecords)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Complaints could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [role])
  useEffect(() => {
    void load(true)
    const timer = window.setInterval(() => { void load() }, role === 'admin' ? 5_000 : 10_000)
    return () => window.clearInterval(timer)
  }, [load, refreshKey, role])
  return { complaints, error, loading, reload: load, setError }
}

function ComplaintCard({ complaint, onSelect }: { complaint: Complaint; onSelect: (complaint: Complaint) => void }) {
  return <button className="workflow-complaint-card" onClick={() => onSelect(complaint)}><span className="workflow-complaint-main"><strong>{complaint.title}</strong><small>{complaint.trackingId} · {complaint.category}</small><small><MapPin /> {complaint.area || complaint.location || 'Location not provided'}</small></span><span className="workflow-complaint-meta"><StatusLabel status={complaint.status} /><small>{complaint.contractorName ? `Assigned: ${complaint.contractorName}` : 'Awaiting assignment'}</small></span><ArrowRight /></button>
}

function PhotoGrid({ photos }: { photos: Photo[] }) {
  if (photos.length === 0) return null
  return <div className="workflow-photo-grid">{photos.map((photo, index) => <figure key={`${photo.url}-${index}`}><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={`Complaint evidence ${index + 1}`} /></a>{photo.description && <figcaption>{photo.description}</figcaption>}</figure>)}</div>
}

function UpdateList({ updates }: { updates: Update[] }) {
  if (updates.length === 0) return <p className="workflow-muted">No progress updates have been recorded.</p>
  return <ol className="workflow-updates">{updates.map((update, index) => <li key={`${update.type}-${index}`}><span className="workflow-update-icon"><Clock3 /></span><div><strong>{update.message}</strong><small>{update.actorName} · {update.actorRole}{update.createdAt ? ` · ${new Date(update.createdAt).toLocaleString()}` : ''}</small></div></li>)}</ol>
}

function ComplaintDetails({ complaint, children }: { complaint: Complaint; children?: React.ReactNode }) {
  return <section className="workflow-detail panel"><div className="workflow-detail-head"><div><span className="eyebrow">{complaint.trackingId}</span><h2>{complaint.title}</h2><p>{complaint.category} · {complaint.area || complaint.location}</p></div><StatusLabel status={complaint.status} /></div>
    {complaint.details && <p className="workflow-detail-description">{complaint.details}</p>}
    <dl className="workflow-detail-meta"><div><dt>Submitted by</dt><dd>{complaint.citizenName || 'Citizen'}{complaint.citizenMobile ? ` · ${complaint.citizenMobile}` : ''}</dd></div><div><dt>Contractor</dt><dd>{complaint.contractorName || 'Not assigned'}</dd></div><div><dt>Submitted</dt><dd>{complaint.createdAt ? new Date(complaint.createdAt).toLocaleString() : 'Date unavailable'}</dd></div></dl>
    {complaint.complaintPhotos.length > 0 && <><h3>Original report photos</h3><PhotoGrid photos={complaint.complaintPhotos} /></>}
    {complaint.completionDescription && <><h3>Contractor completion report</h3><p className="workflow-detail-description">{complaint.completionDescription}</p></>}
    {complaint.photos.length > 0 && <><h3>Completion photographs</h3><PhotoGrid photos={complaint.photos} /></>}
    <h3>Progress history</h3><UpdateList updates={complaint.updates || []} />{children}
  </section>
}

function useRefreshDetail(
  trackingId: string | undefined,
  setComplaint: Dispatch<SetStateAction<Complaint | null>>,
  setError: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    if (!trackingId) return
    const refresh = async () => {
      try {
        setComplaint(await requestJson<Complaint>(`/api/complaints?id=${encodeURIComponent(trackingId)}`))
        setError('')
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Complaint details could not be refreshed.')
      }
    }
    const timer = window.setInterval(() => { void refresh() }, 10_000)
    return () => window.clearInterval(timer)
  }, [setComplaint, setError, trackingId])
}

export function CitizenDashboard({ user, onLogout, onHome, refreshKey = 0 }: {
  user: PortalUser
  onLogout: () => void
  onHome: (openForm?: boolean) => void
  refreshKey?: number
}) {
  const { complaints, error, loading, reload } = useComplaints('citizen', refreshKey)
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [detailError, setDetailError] = useState('')
  useRefreshDetail(selected?.trackingId, setSelected, setDetailError)

  const openDetails = async (complaint: Complaint) => {
    setSelected(complaint)
    setDetailError('')
    try {
      setSelected(await requestJson<Complaint>(`/api/complaints?id=${encodeURIComponent(complaint.trackingId)}`))
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : 'Complaint details could not be loaded.')
    }
  }

  return <div className="workflow-page"><ScreenHeader user={user} title="My complaints" subtitle="Private citizen account" onLogout={onLogout} onHome={() => onHome()} /><main className="workflow-content">
    <div className="workflow-page-heading"><div><span className="eyebrow">Citizen portal</span><h1>Your reports and updates</h1><p>Only complaints registered with your signed-in mobile number are shown here.</p></div><button className="button button-primary" onClick={() => onHome(true)}>Submit a complaint <ArrowRight /></button></div>
    {error && <ErrorBanner message={error} onRetry={() => { void reload(true) }} />}{loading && complaints.length === 0 && <p className="workflow-muted">Loading your complaints...</p>}
    <div className="workflow-list">{complaints.map((complaint) => <ComplaintCard key={complaint.trackingId} complaint={complaint} onSelect={openDetails} />)}{!loading && complaints.length === 0 && <div className="workflow-empty"><FileText /><strong>No complaints yet</strong><span>Reports you submit will appear here.</span><button className="button button-outline small" onClick={() => onHome(true)}>Submit your first complaint</button></div>}</div>
    {selected && <ComplaintDetails complaint={selected}>{detailError && <ErrorBanner message={detailError} onRetry={() => { void openDetails(selected) }} />}</ComplaintDetails>}
  </main></div>
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="workflow-error" role="alert"><AlertTriangle /><span>{message}</span>{onRetry && <button onClick={onRetry}>Retry</button>}</div>
}

export function ContractorDashboard({ user, onLogout, onHome }: {
  user: PortalUser
  onLogout: () => void
  onHome: () => void
}) {
  const { complaints, error, loading, reload } = useComplaints('contractor')
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [detailError, setDetailError] = useState('')
  const [actionError, setActionError] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  useRefreshDetail(selected?.trackingId, setSelected, setDetailError)

  const openDetails = async (complaint: Complaint) => {
    setSelected(complaint)
    setDetailError('')
    setActionError('')
    try {
      setSelected(await requestJson<Complaint>(`/api/complaints?id=${encodeURIComponent(complaint.trackingId)}`))
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : 'Complaint details could not be loaded.')
    }
  }

  const startWork = async () => {
    if (!selected) return
    setSaving(true)
    setActionError('')
    try {
      await requestJson(`/api/complaints/${encodeURIComponent(selected.trackingId)}/status`, { method: 'POST' })
      await reload()
      await openDetails(selected)
    } catch (action) {
      setActionError(action instanceof Error ? action.message : 'Work could not be started.')
    } finally {
      setSaving(false)
    }
  }

  const submitCompletion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setActionError('')
    try {
      const form = new FormData()
      form.append('description', description)
      photos.forEach((photo) => form.append('photos', photo))
      await requestJson(`/api/complaints/${encodeURIComponent(selected.trackingId)}/completion`, { method: 'POST', body: form })
      setDescription('')
      setPhotos([])
      await reload()
      await openDetails(selected)
    } catch (action) {
      setActionError(action instanceof Error ? action.message : 'Completion evidence could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="workflow-page"><ScreenHeader user={user} title="Contractor workspace" subtitle="Assigned complaints only" onLogout={onLogout} onHome={onHome} /><main className="workflow-content">
    <div className="workflow-page-heading"><div><span className="eyebrow">Assigned to you</span><h1>Work orders</h1><p>Update each assigned case and submit photographs when work is complete.</p></div><button className="icon-button" aria-label="Refresh work orders" onClick={() => { void reload(true) }}><RefreshCw /></button></div>
    {error && <ErrorBanner message={error} onRetry={() => { void reload(true) }} />}{loading && complaints.length === 0 && <p className="workflow-muted">Loading assigned work...</p>}
    <div className="workflow-list">{complaints.map((complaint) => <ComplaintCard key={complaint.trackingId} complaint={complaint} onSelect={openDetails} />)}{!loading && complaints.length === 0 && <div className="workflow-empty"><Building2 /><strong>No assigned work orders</strong><span>Cases assigned to your account will appear here.</span></div>}</div>
    {selected && <ComplaintDetails complaint={selected}>{detailError && <ErrorBanner message={detailError} onRetry={() => { void openDetails(selected) }} />}{actionError && <ErrorBanner message={actionError} />}
      {(selected.status === 'Assigned' || selected.status === 'Rework required') && <button className="button button-primary" disabled={saving} onClick={() => { void startWork() }}>{saving ? 'Updating...' : selected.status === 'Rework required' ? 'Start requested rework' : 'Start work'} <ArrowRight /></button>}
      {selected.status === 'In progress' && <form className="workflow-action-form" onSubmit={submitCompletion}><h3>Submit completion for admin review</h3><label>Work description<textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={5} maxLength={2000} required rows={4} /></label><label className="workflow-file-picker"><Upload /> Completion photographs<input type="file" accept="image/jpeg,image/png,image/webp" multiple required onChange={(event) => setPhotos(Array.from(event.target.files || []).slice(0, 10))} /></label><small>{photos.length} photo(s) selected · 1–10 JPEG, PNG, or WebP images, max 10 MB each</small><button className="button button-primary" disabled={saving || photos.length === 0}>{saving ? 'Uploading evidence...' : 'Submit work for review'} <ArrowRight /></button></form>}
      {selected.status === 'Work completed' && <p className="workflow-review-wait"><Clock3 /> Your completion report is awaiting admin review.</p>}
      {selected.status === 'Closed' && <p className="workflow-review-wait"><Check /> This complaint has been approved and closed.</p>}
    </ComplaintDetails>}
  </main></div>
}

function ComplaintMap({ complaints, onSelect }: { complaints: Complaint[]; onSelect: (complaint: Complaint) => void }) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<google.maps.Map | null>(null)
  const markers = useRef<google.maps.Marker[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  useEffect(() => {
    if (!key || !element.current) return
    let cancelled = false
    setOptions({ key, v: 'weekly' })
    importLibrary('maps').then(({ Map }) => {
      if (cancelled || !element.current) return
      map.current = new Map(element.current, { center: { lat: 18.5204, lng: 73.8567 }, zoom: 11, mapTypeControl: false, streetViewControl: false })
      setReady(true)
    }).catch(() => {
      if (!cancelled) setError('Google Maps could not load. Verify the key and Maps JavaScript API configuration.')
    })
    return () => { cancelled = true }
  }, [key])

  useEffect(() => {
    if (!ready || !map.current) return
    markers.current.forEach((marker) => marker.setMap(null))
    markers.current = complaints.filter((complaint) => complaint.latitude != null && complaint.longitude != null).map((complaint) => {
      const marker = new google.maps.Marker({
        map: map.current,
        position: { lat: complaint.latitude!, lng: complaint.longitude! },
        title: `${complaint.trackingId} · ${complaint.title}`,
      })
      marker.addListener('click', () => onSelect(complaint))
      return marker
    })
    if (markers.current.length > 0) {
      const bounds = new google.maps.LatLngBounds()
      markers.current.forEach((marker) => { if (marker.getPosition()) bounds.extend(marker.getPosition()!) })
      map.current.fitBounds(bounds)
    }
    return () => markers.current.forEach((marker) => marker.setMap(null))
  }, [complaints, onSelect, ready])

  if (!key) return <div className="workflow-map-config">Configure NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to display real complaint locations.</div>
  if (error) return <div className="workflow-map-config" role="alert">{error}</div>
  return <div ref={element} className="workflow-google-map" aria-label="Complaint locations" />
}

export function AdminDashboard({ user, onLogout, onHome }: {
  user: PortalUser
  onLogout: () => void
  onHome: () => void
}) {
  const { complaints, error, loading, reload, setError } = useComplaints('admin')
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [contractorError, setContractorError] = useState('')
  const [tab, setTab] = useState('Overview')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [assigning, setAssigning] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  useRefreshDetail(selected?.trackingId, setSelected, setActionError)

  useEffect(() => {
    requestJson<Contractor[]>('/api/contractors').then(setContractors).catch((loadError) => {
      setContractorError(loadError instanceof Error ? loadError.message : 'Contractors could not be loaded.')
    })
  }, [])

  const categories = useMemo(() => Array.from(new Map(complaints.map((item) => [item.categoryId, item.category])).entries()), [complaints])
  const filtered = useMemo(() => complaints.filter((item) =>
    (statusFilter === 'All' || item.status === statusFilter)
    && (categoryFilter === 'All' || item.categoryId === categoryFilter)
    && `${item.trackingId} ${item.title} ${item.category} ${item.area} ${item.citizenMobile}`.toLowerCase().includes(query.toLowerCase()),
  ), [categoryFilter, complaints, query, statusFilter])
  const needingReview = complaints.filter((complaint) => complaint.status === 'Work completed')
  const openCount = complaints.filter((complaint) => complaint.status !== 'Closed').length
  const tabs = ['Overview', 'Complaints', 'Map intelligence', 'Departments']

  const openDetails = async (complaint: Complaint) => {
    setSelected(complaint)
    setActionError('')
    try {
      const detail = await requestJson<Complaint>(`/api/complaints?id=${encodeURIComponent(complaint.trackingId)}`)
      setSelected(detail)
      setAssigning(detail.contractorId || '')
    } catch (loadError) {
      setActionError(loadError instanceof Error ? loadError.message : 'Complaint details could not be loaded.')
    }
  }

  const assignContractor = async () => {
    if (!selected || !assigning) return
    setSaving(true)
    setActionError('')
    try {
      await requestJson(`/api/complaints/${encodeURIComponent(selected.trackingId)}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractorId: assigning }),
      })
      await reload()
      await openDetails(selected)
    } catch (action) {
      setActionError(action instanceof Error ? action.message : 'The complaint could not be assigned.')
    } finally {
      setSaving(false)
    }
  }

  const reviewWork = async (decision: 'approve' | 'reject') => {
    if (!selected) return
    setSaving(true)
    setActionError('')
    try {
      await requestJson(`/api/complaints/${encodeURIComponent(selected.trackingId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason: rejectReason }),
      })
      setRejectReason('')
      await reload()
      await openDetails(selected)
    } catch (action) {
      setActionError(action instanceof Error ? action.message : 'The work could not be reviewed.')
    } finally {
      setSaving(false)
    }
  }

  const departmentRows = categories.map(([categoryId, name]) => ({
    categoryId,
    name,
    total: complaints.filter((item) => item.categoryId === categoryId).length,
    open: complaints.filter((item) => item.categoryId === categoryId && item.status !== 'Closed').length,
    review: complaints.filter((item) => item.categoryId === categoryId && item.status === 'Work completed').length,
  }))

  return <div className="workflow-page"><ScreenHeader user={user} title="Admin workspace" subtitle="Live Firestore complaints" onLogout={onLogout} onHome={onHome} />
    <aside className="workflow-tabs" aria-label="Admin dashboard">{tabs.map((item) => <button key={item} className={tab === item ? 'selected' : ''} onClick={() => setTab(item)}>{item}{item === 'Complaints' && <span>{complaints.length}</span>}{item === 'Overview' && needingReview.length > 0 && <span className="workflow-tab-alert">{needingReview.length}</span>}</button>)}</aside>
    <main className="workflow-content">
      {error && <ErrorBanner message={error} onRetry={() => { void reload(true) }} />}{contractorError && <ErrorBanner message={contractorError} />}
      {tab === 'Overview' && <><div className="workflow-page-heading"><div><span className="eyebrow">Live service desk</span><h1>Complaint overview</h1><p>One shared complaint record across citizen, admin, and contractor portals.</p></div><button className="icon-button" aria-label="Refresh complaints" onClick={() => { void reload(true) }}><RefreshCw /></button></div>
        <div className="workflow-kpis"><button onClick={() => { setTab('Complaints'); setStatusFilter('All') }}><FileText /><span>Total reports</span><strong>{complaints.length.toLocaleString()}</strong></button><button onClick={() => { setTab('Complaints'); setStatusFilter('Submitted') }}><Clock3 /><span>Awaiting assignment</span><strong>{complaints.filter((item) => item.status === 'Submitted').length}</strong></button><button onClick={() => { setTab('Complaints'); setStatusFilter('Work completed') }}><AlertTriangle /><span>Work awaiting review</span><strong>{needingReview.length}</strong></button><button onClick={() => { setTab('Complaints'); setStatusFilter('All') }}><Check /><span>Open cases</span><strong>{openCount}</strong></button></div>
        <section className="workflow-section"><div className="workflow-section-heading"><div><h2>Recent complaints</h2><p>Latest records from the shared Firestore collection.</p></div><button className="button button-outline small" onClick={() => setTab('Complaints')}>View all <ArrowRight /></button></div><div className="workflow-list">{complaints.slice(0, 8).map((complaint) => <ComplaintCard key={complaint.trackingId} complaint={complaint} onSelect={openDetails} />)}{!loading && complaints.length === 0 && <div className="workflow-empty"><FileText /><strong>No reports in Firestore</strong><span>Import the supplied dataset or submit a citizen report to populate the shared portal.</span></div>}</div></section>
        {needingReview.length > 0 && <section className="workflow-section"><div className="workflow-section-heading"><div><h2>Work awaiting your review</h2><p>Review the contractor's report and completion photographs.</p></div></div><div className="workflow-list">{needingReview.slice(0, 5).map((complaint) => <ComplaintCard key={complaint.trackingId} complaint={complaint} onSelect={openDetails} />)}</div></section>}
      </>}
      {tab === 'Complaints' && <><div className="workflow-page-heading"><div><span className="eyebrow">Case management</span><h1>Complaints</h1><p>Search, assign, and review records from the shared database.</p></div><button className="icon-button" aria-label="Refresh complaints" onClick={() => { void reload(true) }}><RefreshCw /></button></div>
        <div className="workflow-filters"><label className="search-box"><Search /><input aria-label="Search complaints" placeholder="Tracking ID, title, location, or citizen mobile" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option>{['Submitted', 'Assigned', 'In progress', 'Work completed', 'Rework required', 'Closed'].map((status) => <option key={status}>{status}</option>)}</select></label><label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="All">All categories</option>{categories.map(([categoryId, category]) => <option key={categoryId} value={categoryId}>{category}</option>)}</select></label><span>{filtered.length} results</span></div>
        {loading && complaints.length === 0 && <p className="workflow-muted">Loading complaint records...</p>}<div className="workflow-list">{filtered.map((complaint) => <ComplaintCard key={complaint.trackingId} complaint={complaint} onSelect={openDetails} />)}{!loading && filtered.length === 0 && <div className="workflow-empty"><Search /><strong>No matching complaints</strong><span>Adjust the search or filters.</span></div>}</div>
      </>}
      {tab === 'Map intelligence' && <><div className="workflow-page-heading"><div><span className="eyebrow">Complaint locations</span><h1>Map intelligence</h1><p>Map markers use coordinates saved with the same complaint records.</p></div></div><div className="workflow-map-layout"><ComplaintMap complaints={complaints} onSelect={openDetails} /><div className="workflow-list workflow-map-list">{complaints.filter((item) => item.latitude != null && item.longitude != null).map((complaint) => <ComplaintCard key={complaint.trackingId} complaint={complaint} onSelect={openDetails} />)}</div></div></>}
      {tab === 'Departments' && <><div className="workflow-page-heading"><div><span className="eyebrow">Service categories</span><h1>Departments</h1><p>Workload and contractor coverage are derived from live complaint categories.</p></div></div><div className="workflow-departments">{departmentRows.map((row) => <article className="panel workflow-department" key={row.categoryId}><span className="workflow-department-icon"><Building2 /></span><h2>{row.name}</h2><p>{row.total} complaints in this service category</p><dl><div><dt>Open</dt><dd>{row.open}</dd></div><div><dt>Awaiting review</dt><dd>{row.review}</dd></div><div><dt>Contractors</dt><dd>{contractors.filter((item) => item.categoryId === row.categoryId).length}</dd></div></dl><button className="button button-outline small" onClick={() => { setCategoryFilter(row.categoryId); setStatusFilter('All'); setTab('Complaints') }}>View complaints <ArrowRight /></button></article>)}{departmentRows.length === 0 && <div className="workflow-empty"><Building2 /><strong>No department data</strong><span>Import the supplied dataset to load service categories.</span></div>}</div></>}
      {selected && <div className="workflow-overlay" role="presentation" onClick={() => setSelected(null)}><div className="workflow-modal panel" role="dialog" aria-modal="true" aria-label={`Complaint ${selected.trackingId}`} onClick={(event) => event.stopPropagation()}><button className="workflow-modal-close" aria-label="Close complaint details" onClick={() => setSelected(null)}><X /></button><ComplaintDetails complaint={selected}>
        {actionError && <ErrorBanner message={actionError} />}
        {selected.status !== 'Closed' && selected.status !== 'Work completed' && <section className="workflow-action-form"><h3>Assign contractor</h3>{contractorError ? <ErrorBanner message={contractorError} /> : <><label>Contractor<select value={assigning} onChange={(event) => setAssigning(event.target.value)}><option value="">Choose a matching contractor</option>{contractors.filter((contractor) => !selected.categoryId || contractor.categoryId === selected.categoryId).sort((a, b) => Number(b.zoneId === selected.zoneId) - Number(a.zoneId === selected.zoneId)).map((contractor) => <option key={contractor.contractorId} value={contractor.contractorId}>{contractor.name} · {contractor.firmName}{contractor.zoneName ? ` · ${contractor.zoneName}` : ''}{contractor.serviceAreas ? ` · ${contractor.serviceAreas}` : ''}</option>)}</select></label><button className="button button-primary" disabled={saving || !assigning} onClick={() => { void assignContractor() }}>{saving ? 'Assigning...' : selected.contractorId ? 'Reassign complaint' : 'Assign complaint'} <ArrowRight /></button></>}</section>}
        {selected.status === 'Work completed' && <section className="workflow-action-form"><h3>Review contractor completion</h3><p>Approve the photographs for citizen viewing and close the case, or return it for rework.</p><label>Reason for further work<textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={3} placeholder="Required when rejecting the submitted work" /></label><div className="workflow-inline-actions"><button className="button button-outline" disabled={saving} onClick={() => { void reviewWork('reject') }}>Request further work</button><button className="button button-primary" disabled={saving} onClick={() => { void reviewWork('approve') }}>{saving ? 'Saving review...' : 'Approve and close'} <Check /></button></div></section>}
      </ComplaintDetails></div></div>}
    </main>
  </div>
}
