'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Droplets,
  FileText,
  Filter,
  Globe2,
  House,
  Lightbulb,
  ListFilter,
  LocateFixed,
  ImagePlus,
  MapPin,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Navigation,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserRound,
  X,
  Zap,
} from 'lucide-react'

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

function Logo() {
  return <div className="brand"><span className="brand-mark"><ShieldCheck /></span><span>GovFix <em>Civic</em></span></div>
}

function StatusBadge({ status }: { status: Status }) {
  const tone = status === 'Resolved' ? 'success' : status === 'In progress' ? 'info' : status === 'Under review' ? 'warning' : 'neutral'
  return <span className={`status-badge ${tone}`}><span className="status-dot" />{status}</span>
}

function CitizenLanding({ onEmployee }: { onEmployee: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  return <div className="citizen-shell">
    <header className="public-header"><Logo /><nav className={mobileMenuOpen ? 'open' : ''}><a href="#how" onClick={() => setMobileMenuOpen(false)}>How it works</a><a href="#issues" onClick={() => setMobileMenuOpen(false)}>Civic issues</a><a href="#contact" onClick={() => setMobileMenuOpen(false)}>Contact</a></nav><div className="header-actions"><button className="text-button" onClick={onEmployee}>Staff portal <ArrowRight /></button><button className="button button-dark small" onClick={() => setShowForm(true)}>Track a complaint</button></div><button className="mobile-menu" aria-label="Open menu" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}><Menu /></button></header>
    <main>
      <section className="hero-section"><div className="hero-copy"><div className="eyebrow"><span className="pulse" /> The civic service desk for your city</div><h1>Your city.<br /><span>Your voice.</span><br />Your solution.</h1><p>Report local issues, follow every update, and help make our neighborhoods better — together.</p><div className="hero-actions"><button className="button button-primary" onClick={() => setShowForm(true)}>Register a complaint <ArrowRight /></button><button className="button button-ghost" onClick={() => setShowForm(true)}>Track my complaint</button></div><div className="trust-row"><div className="avatar-stack"><span>AK</span><span>RM</span><span>JS</span></div><span><strong>12,480+</strong> residents making a difference</span></div></div></section>
      <section className="stat-strip"><div><strong>4,286</strong><span>issues resolved</span></div><div><strong>96%</strong><span>response rate</span></div><div><strong>2.4 days</strong><span>average resolution</span></div><div><strong>18</strong><span>departments connected</span></div></section>
      <section className="how-section" id="how"><div className="section-heading"><div><span className="eyebrow">Simple by design</span><h2>From report to resolution.</h2></div><p>Every complaint has a clear owner, a visible status, and a path forward.</p></div><div className="steps"><div className="step-card"><span className="step-number">01</span><span className="step-icon"><MessageSquareText /></span><h3>Submit</h3><p>Tell us what is happening in your neighborhood. Add a photo and location for faster action.</p></div><div className="step-card featured"><span className="step-number">02</span><span className="step-icon"><Clock3 /></span><h3>Track</h3><p>Get a unique tracking ID and see exactly who is handling your request, in real time.</p></div><div className="step-card"><span className="step-number">03</span><span className="step-icon"><ShieldCheck /></span><h3>Resolve</h3><p>Receive updates from your city team and confirm when the issue has been resolved.</p></div></div></section>
      <section className="issues-section" id="issues"><div className="section-heading"><div><span className="eyebrow">What can we help with?</span><h2>Make your neighborhood better.</h2></div><button className="arrow-link" onClick={() => setShowForm(true)}>View all services <ArrowRight /></button></div><div className="issue-grid"><IssueCard icon={Trash2} title="Sanitation" count="842 reports" tone="green" onSelect={() => setShowForm(true)} /><IssueCard icon={Droplets} title="Water supply" count="614 reports" tone="blue" onSelect={() => setShowForm(true)} /><IssueCard icon={Navigation} title="Roads & paths" count="489 reports" tone="orange" onSelect={() => setShowForm(true)} /><IssueCard icon={Lightbulb} title="Streetlights" count="357 reports" tone="purple" onSelect={() => setShowForm(true)} /></div></section>
      <section className="public-cta" id="contact"><div><span className="eyebrow">Have a question?</span><h2>Need help with a civic issue?</h2><p>Our service desk is here Monday–Friday, 8am–6pm.</p></div><a className="button button-light" href="mailto:help@govfix.local">Contact the service desk <ArrowRight /></a></section>
    </main>
    <footer className="public-footer"><Logo /><span>© 2025 GovFix Civic · A fictional demo platform</span><div><a href="#contact">Privacy</a><a href="#contact">Accessibility</a></div></footer>
    {showForm && <ComplaintModal onClose={() => { setShowForm(false); setSubmitted(null) }} submitted={submitted} onSubmit={setSubmitted} />}
  </div>
}

function IssueCard({ icon: Icon, title, count, tone, onSelect }: { icon: typeof Trash2; title: string; count: string; tone: string; onSelect: () => void }) { return <button className="issue-card" onClick={onSelect}><span className={`issue-icon ${tone}`}><Icon /></span><span><strong>{title}</strong><small>{count}</small></span><ArrowRight /></button> }

function ComplaintModal({ onClose, submitted, onSubmit }: { onClose: () => void; submitted: string | null; onSubmit: (trackingId: string) => void }) {
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [details, setDetails] = useState('')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationState, setLocationState] = useState<'idle' | 'requesting' | 'ready' | 'error'>('idle')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [images, setImages] = useState<File[]>([])
  const imagePreviews = images.map((file) => ({ file, url: URL.createObjectURL(file) }))
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationState('error')
      setError('Live location is not supported by this browser.')
      return
    }
    setLocationState('requesting')
    setError('')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({ latitude: coords.latitude, longitude: coords.longitude })
        setLocationState('ready')
      },
      () => {
        setLocationState('error')
        setError('We could not access your location. Allow location access and try again.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }
  const submit = async () => {
    if (!category || !title.trim() || !coordinates || !consent) {
      setError('Choose a category, add a title, share your live location, then confirm the details.')
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('category', category)
      formData.append('title', title.trim())
      formData.append('location', location.trim())
      formData.append('details', details.trim())
      formData.append('latitude', String(coordinates.latitude))
      formData.append('longitude', String(coordinates.longitude))
      images.forEach((image) => formData.append('images', image))
      const response = await fetch('/api/complaints', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json() as { trackingId?: string; error?: string }
      if (!response.ok || !result.trackingId) throw new Error(result.error || 'Complaint could not be saved.')
      onSubmit(result.trackingId)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Complaint could not be saved.')
    } finally {
      setIsSubmitting(false)
    }
  }
  return <div className="modal-backdrop" role="presentation"><div className="complaint-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={onClose} aria-label="Close"><X /></button>{submitted ? <div className="success-state"><span className="success-icon"><Check /></span><span className="eyebrow">Complaint registered</span><h2>Your voice is on its way.</h2><p>We&apos;ve created a tracking ID for your report. Keep it handy for future updates.</p><div className="tracking-code">{submitted} <button aria-label="Copy tracking code" onClick={() => navigator.clipboard?.writeText(submitted)}><FileText /></button></div><button className="button button-primary" onClick={onClose}>Back to home</button></div> : <><span className="eyebrow">New complaint</span><h2 id="modal-title">What needs attention?</h2><p className="modal-intro">Share the details and your city team will take it from there.</p><label>What is the issue?<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="" disabled>Select a category</option><option>Water supply and leakage</option><option>Garbage collection and sanitation</option><option>Road damage and potholes</option><option>Streetlight failure</option><option>Drainage and sewage</option></select></label><label>Give it a title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Water leaking outside my home" /></label><label>Where is it happening?<div className="input-with-icon"><MapPin /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Optional address or landmark" /></div></label><button className={`location-button ${locationState}`} onClick={requestLocation} disabled={locationState === 'requesting'}><LocateFixed />{locationState === 'requesting' ? 'Getting your location...' : locationState === 'ready' ? 'Live location captured' : 'Use my live location'}</button>{coordinates && <small className="location-status">Coordinates captured: {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}</small>}<label>Tell us more<textarea value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Add any useful details..." rows={3} /></label><div className="image-upload"><div className="image-upload-heading"><span><ImagePlus /> Photos of the problem</span><small>{images.length}/10 selected</small></div><label className="upload-button"><ImagePlus /> Take or upload photos<input type="file" accept="image/*" capture="environment" multiple onChange={(event) => { const selected = Array.from(event.target.files || []); setImages((current) => [...current, ...selected].slice(0, 10)); event.currentTarget.value = '' }} /></label>{imagePreviews.length > 0 && <div className="image-previews">{imagePreviews.map(({ file, url }, index) => <div className="image-preview" key={`${file.name}-${index}`}><img src={url} alt={`Problem photo ${index + 1}`} /><button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => setImages((current) => current.filter((_, photoIndex) => photoIndex !== index))}><X /></button></div>)}</div>}<small className="image-help">You can select up to 10 images. Each image must be 10 MB or smaller.</small></div><div className="consent"><input type="checkbox" id="consent" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><label htmlFor="consent">I confirm these details are accurate.</label></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary full" onClick={submit} disabled={isSubmitting}>{isSubmitting ? 'Saving complaint...' : 'Submit complaint'} {!isSubmitting && <ArrowRight />}</button><small className="demo-note"><Sparkles /> Your live coordinates and photos are stored securely with this report.</small></>}</div></div>
}

function ComplaintsWorkspace({ complaints: items, onSelect, onBack }: { complaints: Complaint[]; onSelect: (complaint: Complaint) => void; onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | 'All'>('All')
  const filtered = items.filter((item) => (status === 'All' || item.status === status) && `${item.title} ${item.id} ${item.category} ${item.area}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="workspace-view"><div className="view-heading"><div><span className="eyebrow">Case management</span><h1>Complaints</h1><p>Review, search, and open every report from your city.</p></div><button className="button button-outline small" onClick={onBack}><BarChart3 /> Overview</button></div><div className="panel complaints-toolbar"><div className="search-box"><Search /><input aria-label="Search all complaints" placeholder="Search by title, ID, category, or area..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><label className="toolbar-filter">Status<select value={status} onChange={(event) => setStatus(event.target.value as Status | 'All')}><option>All</option><option>Submitted</option><option>Under review</option><option>Assigned</option><option>In progress</option><option>Resolved</option></select></label><span className="result-count">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span></div><div className="panel full-complaints-panel"><div className="table-wrap"><table><thead><tr><th>Complaint</th><th>Status</th><th>Location</th><th>Department</th><th>Received</th><th /></tr></thead><tbody>{filtered.map((item) => { const Icon = item.icon; return <tr key={item.id} onClick={() => onSelect(item)}><td><div className="complaint-name"><span className="table-icon"><Icon /></span><span><strong>{item.title}</strong><small>{item.id} · {item.category}</small></span></div></td><td><StatusBadge status={item.status} /></td><td>{item.area}</td><td>{item.department}</td><td>{item.age}</td><td><button className="row-more" aria-label={`Open ${item.id}`} onClick={(event) => { event.stopPropagation(); onSelect(item) }}><ArrowRight /></button></td></tr> })}</tbody></table>{filtered.length === 0 && <div className="empty-state"><FileText /><strong>No complaints found</strong><span>Try a different search or status filter.</span></div>}</div></div></div>
}

function GoogleComplaintMap({ complaints: items, focusedComplaint, onSelect }: { complaints: Complaint[]; focusedComplaint: Complaint | null; onSelect: (complaint: Complaint) => void }) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  const [mapError, setMapError] = useState('')
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!apiKey || !mapElement.current) return
    let cancelled = false
    setOptions({ key: apiKey, v: 'weekly' })
    importLibrary('maps').then(({ Map }) => {
      if (cancelled || !mapElement.current) return
      mapRef.current = new Map(mapElement.current, {
        center: { lat: 40.7128, lng: -74.006 },
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      })
      setMapReady(true)
    }).catch(() => {
      if (!cancelled) setMapError('Google Maps could not load. Check the API key, billing, and enabled Maps JavaScript API.')
    })
    return () => { cancelled = true }
  }, [apiKey])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    markersRef.current.forEach((marker) => marker.setMap(null))
    let cancelled = false
    importLibrary('marker').then(({ Marker }) => {
      if (cancelled || !mapRef.current) return
      markersRef.current = items.map((item) => {
        const marker = new Marker({
        map: mapRef.current,
        position: { lat: item.latitude, lng: item.longitude },
        title: `${item.id}: ${item.title}`,
        label: item.priority === 'High' ? '!' : undefined,
        })
        marker.addListener('click', () => onSelect(item))
        return marker
      })
      if (items.length > 0) {
        const bounds = new google.maps.LatLngBounds()
        items.forEach((item) => bounds.extend({ lat: item.latitude, lng: item.longitude }))
        mapRef.current.fitBounds(bounds, 80)
      }
    })
    return () => {
      cancelled = true
      markersRef.current.forEach((marker) => marker.setMap(null))
    }
  }, [items, mapReady, onSelect])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !focusedComplaint) return
    const position = { lat: focusedComplaint.latitude, lng: focusedComplaint.longitude }
    mapRef.current.panTo(position)
    mapRef.current.setZoom(17)
  }, [focusedComplaint, mapReady])

  if (!apiKey) return <div className="google-map-config"><MapPin /><strong>Google Maps is not configured</strong><span>Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to <code>.env.local</code>, then restart the dev server.</span></div>
  if (mapError) return <div className="google-map-config error"><MapPin /><strong>Map unavailable</strong><span>{mapError}</span></div>
  return <div ref={mapElement} className="google-map" aria-label="Complaint locations map" />
}

function MapIntelligence({ complaints: items, onSelect, onBack }: { complaints: Complaint[]; onSelect: (complaint: Complaint) => void; onBack: () => void }) {
  const [category, setCategory] = useState('All')
  const [focusedComplaint, setFocusedComplaint] = useState<Complaint | null>(null)
  const categories = ['All', ...Array.from(new Set(items.map((item) => item.category)))]
  const visible = items.filter((item) => category === 'All' || item.category === category)
  const selectComplaint = (complaint: Complaint) => {
    setFocusedComplaint(complaint)
    onSelect(complaint)
  }
  return <div className="workspace-view"><div className="view-heading"><div><span className="eyebrow">Live service map</span><h1>Map intelligence</h1><p>Explore complaint hotspots and open a case from the map.</p></div><button className="button button-outline small" onClick={onBack}><BarChart3 /> Overview</button></div><div className="map-intelligence-grid"><div className="panel intelligence-map"><GoogleComplaintMap complaints={visible} focusedComplaint={focusedComplaint} onSelect={selectComplaint} /><div className="map-footer"><span><i className="legend-dot blue" /> {visible.length} visible reports</span><span><i className="legend-dot orange" /> Select a marker for details</span></div></div><div className="panel map-report-list"><div className="panel-header"><div><h2>Reports on map</h2><p>Filter by issue category</p></div><MapPin /></div><div className="map-category-list">{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}<span>{item === 'All' ? items.length : items.filter((complaint) => complaint.category === item).length}</span></button>)}</div><div className="map-case-list">{visible.map((item) => <button key={item.id} className={focusedComplaint?.id === item.id ? 'selected' : ''} onClick={() => selectComplaint(item)}><span><strong>{item.id}</strong><small>{item.title}</small></span><StatusBadge status={item.status} /></button>)}</div></div></div></div>
}

const departments = [
  { name: 'Water & Utilities', lead: 'Priya Shah', active: 42, resolved: 86, response: '2.1h', tone: 'blue', icon: Droplets },
  { name: 'Public Works', lead: 'Maya Chen', active: 31, resolved: 74, response: '3.4h', tone: 'orange', icon: Building2 },
  { name: 'Sanitation', lead: 'James Miller', active: 24, resolved: 68, response: '1.8h', tone: 'green', icon: Trash2 },
  { name: 'Street Services', lead: 'Amina Yusuf', active: 18, resolved: 52, response: '2.7h', tone: 'purple', icon: Lightbulb },
]

function DepartmentsWorkspace({ onBack, onNotify }: { onBack: () => void; onNotify: (message: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  return <div className="workspace-view"><div className="view-heading"><div><span className="eyebrow">City operations</span><h1>Departments</h1><p>Monitor ownership, workload, and response performance across teams.</p></div><button className="button button-outline small" onClick={onBack}><BarChart3 /> Overview</button></div><div className="department-summary"><div className="panel summary-card"><span className="kpi-icon blue"><Building2 /></span><div><strong>18</strong><small>connected departments</small></div></div><div className="panel summary-card"><span className="kpi-icon orange"><AlertTriangle /></span><div><strong>115</strong><small>active cases</small></div></div><div className="panel summary-card"><span className="kpi-icon green"><Check /></span><div><strong>280</strong><small>resolved this month</small></div></div><div className="panel summary-card"><span className="kpi-icon purple"><Clock3 /></span><div><strong>2.5h</strong><small>average response</small></div></div></div><div className="department-grid">{departments.map(({ name, lead, active, resolved, response, tone, icon: Icon }) => <button key={name} className={`panel department-card ${selected === name ? 'selected' : ''}`} onClick={() => setSelected(name)}><div className="department-card-head"><span className={`kpi-icon ${tone}`}><Icon /></span><span className="department-status"><i /> On track</span></div><h2>{name}</h2><p>Lead · {lead}</p><div className="department-metrics"><span><strong>{active}</strong><small>active cases</small></span><span><strong>{resolved}</strong><small>resolved</small></span><span><strong>{response}</strong><small>avg. response</small></span></div><div className="department-progress"><span style={{ width: `${Math.min(96, 55 + resolved / 5)}%` }} /></div><span className="department-card-action">{selected === name ? 'Department selected' : 'View department details'} <ArrowRight /></span></button>)}</div>{selected && <div className="panel department-detail"><div><span className="eyebrow">Selected department</span><h2>{selected}</h2><p>Review team performance and jump to the complaints assigned to this department.</p></div><div><button className="button button-outline small" onClick={() => setSelected(null)}>Close</button><button className="button button-primary small" onClick={() => onNotify(`Opening ${selected} complaints.`)}>View assigned complaints <ArrowRight /></button></div></div>}</div>
}

function EmployeeDashboard({ onCitizen }: { onCitizen: () => void }) {
  const [activeNav, setActiveNav] = useState('Overview')
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState<Status | 'All'>('All')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let cancelled = false
    fetch('/api/complaints', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as ComplaintRecord[] | { error?: string }
        if (!response.ok) throw new Error('error' in result ? result.error : 'The complaints could not be loaded.')
        if (!cancelled) setComplaints(result.map(complaintFromRecord))
      })
      .catch((loadError) => {
        if (!cancelled) setNotice(loadError instanceof Error ? loadError.message : 'The complaints could not be loaded.')
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [])
  const filtered = useMemo(() => complaints.filter((item) => (statusFilter === 'All' || item.status === statusFilter) && (item.title.toLowerCase().includes(query.toLowerCase()) || item.id.toLowerCase().includes(query.toLowerCase()))), [query, statusFilter])
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2500) }
  if (activeNav === 'Complaints') return <div className="staff-shell"><aside className="sidebar"><div className="sidebar-brand"><Logo /><button className="collapse-button" onClick={() => notify('Sidebar controls are available in the desktop layout.')} aria-label="Sidebar options"><ChevronDown /></button></div><button className="demo-label" onClick={() => notify('Live workspace: public complaints from Supabase.')}><span className="live-dot" /> Live workspace <ChevronDown /></button><nav className="side-nav">{navItems.map(({ label, icon: Icon }) => <button key={label} className={activeNav === label ? 'active' : ''} onClick={() => setActiveNav(label)}><Icon />{label}{label === 'Complaints' && <span className="nav-count">{complaints.length}</span>}</button>)}</nav><div className="sidebar-bottom"><button className="sidebar-switch" onClick={onCitizen}><House /> Public portal</button></div></aside><section className="staff-main"><header className="staff-header"><div className="mobile-staff-title"><Logo /></div><div className="breadcrumbs"><span>Workspace</span><ArrowRight /><strong>{activeNav}</strong></div><div className="staff-header-actions"><button className="icon-button" aria-label="Notifications" onClick={() => notify('No new notifications.')}><Bell /></button><button className="staff-avatar" onClick={() => notify('Signed in as Nadia Rao, Supervisor.')} aria-label="Open profile">NR</button></div></header><main className="staff-content"><ComplaintsWorkspace complaints={complaints} onSelect={setSelected} onBack={() => setActiveNav('Overview')} />{selected && <CasePanel complaint={selected} onClose={() => setSelected(null)} />}</main></section></div>
  if (activeNav === 'Map intelligence') return <div className="staff-shell"><aside className="sidebar"><div className="sidebar-brand"><Logo /></div><button className="demo-label" onClick={() => notify('Live workspace: public complaints from Supabase.')}><span className="live-dot" /> Live workspace <ChevronDown /></button><nav className="side-nav">{navItems.map(({ label, icon: Icon }) => <button key={label} className={activeNav === label ? 'active' : ''} onClick={() => setActiveNav(label)}><Icon />{label}{label === 'Complaints' &&   <span className="nav-count">{complaints.length}</span>}</button>)}</nav><div className="sidebar-bottom"><button className="sidebar-switch" onClick={onCitizen}><House /> Public portal</button></div></aside><section className="staff-main"><header className="staff-header"><div className="mobile-staff-title"><Logo /></div><div className="breadcrumbs"><span>Workspace</span><ArrowRight /><strong>{activeNav}</strong></div></header><main className="staff-content"><MapIntelligence complaints={complaints} onSelect={setSelected} onBack={() => setActiveNav('Overview')} />{selected && <CasePanel complaint={selected} onClose={() => setSelected(null)} />}</main></section></div>
  if (activeNav === 'Departments') return <div className="staff-shell"><aside className="sidebar"><div className="sidebar-brand"><Logo /></div><button className="demo-label" onClick={() => notify('Demo workspace: fictional municipal data.')}><span className="live-dot" />   Live workspace <ChevronDown /></button><nav className="side-nav">{navItems.map(({ label, icon: Icon }) => <button key={label} className={activeNav === label ? 'active' : ''} onClick={() => setActiveNav(label)}><Icon />{label}{label === 'Complaints' &&   <span className="nav-count">{complaints.length}</span>}</button>)}</nav><div className="sidebar-bottom"><button className="sidebar-switch" onClick={onCitizen}><House /> Public portal</button></div></aside><section className="staff-main"><header className="staff-header"><div className="mobile-staff-title"><Logo /></div><div className="breadcrumbs"><span>Workspace</span><ArrowRight /><strong>{activeNav}</strong></div></header><main className="staff-content"><DepartmentsWorkspace onBack={() => setActiveNav('Overview')} onNotify={notify} /></main></section></div>
  return <div className="staff-shell"><aside className="sidebar"><div className="sidebar-brand"><Logo /><button className="collapse-button" onClick={() => notify('Sidebar controls are available in the desktop layout.')} aria-label="Sidebar options"><ChevronDown /></button></div><button className="demo-label" onClick={() => notify('Demo workspace: fictional municipal data.')}><span className="live-dot" /> Demo workspace <ChevronDown /></button><nav className="side-nav">{navItems.map(({ label, icon: Icon }) => <button key={label} className={activeNav === label ? 'active' : ''} onClick={() => setActiveNav(label)}><Icon />{label}{label === 'Complaints' &&   <span className="nav-count">{complaints.length}</span>}</button>)}</nav><div className="sidebar-bottom"><button onClick={() => notify('Help center is available at help@govfix.local.')}><CircleHelp /> Help center</button><button onClick={() => notify('Signed in as Nadia Rao, Supervisor.')}><span className="profile-avatar">NR</span><span><strong>Nadia Rao</strong><small>Supervisor</small></span><MoreHorizontal /></button><button className="sidebar-switch" onClick={onCitizen}><House /> Public portal</button></div></aside><section className="staff-main"><header className="staff-header"><div className="mobile-staff-title"><Logo /></div><div className="breadcrumbs"><span>Workspace</span><ArrowRight /><strong>{activeNav}</strong></div><div className="staff-header-actions"><div className="search-box"><Search /><input aria-label="Search complaints" placeholder="Search complaints..." value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>⌘ K</kbd></div><button className="icon-button" aria-label="Notifications" onClick={() => notify('No new notifications.')}><Bell /><span className="notification-dot" /></button><button className="staff-avatar" onClick={() => notify('Signed in as Nadia Rao, Supervisor.')} aria-label="Open profile">NR</button></div></header><main className="staff-content">{notice && <div className="toast" role="status">{notice}</div>}<div className="staff-welcome"><div><span className="eyebrow">Wednesday, 18 June 2025</span><h1>Good morning, Nadia.</h1><p>Here&apos;s what&apos;s happening across your city today.</p></div><button className="button button-primary" onClick={() => setActiveNav('Complaints')}><Plus /> New complaint</button></div><div className="demo-banner"><span><Sparkles /><strong>Demo workspace</strong> You&apos;re viewing fictional municipal data.</span><button onClick={() => notify('This dashboard uses fictional data for demonstration.')}>Learn more <ArrowRight /></button></div><div className="kpi-grid"><button className="kpi-card-button" onClick={() => setStatusFilter('All')}><Kpi title="Total complaints" value="1,248" change="12.8%" icon={FileText} tone="blue" /></button><button className="kpi-card-button" onClick={() => setStatusFilter('Under review')}><Kpi title="Needs attention" value="86" change="8.4%" icon={AlertTriangle} tone="orange" warning /></button><button className="kpi-card-button" onClick={() => setStatusFilter('In progress')}><Kpi title="In progress" value="214" change="4.6%" icon={Clock3} tone="purple" /></button><button className="kpi-card-button" onClick={() => setStatusFilter('Resolved')}><Kpi title="Resolved this month" value="392" change="18.2%" icon={Check} tone="green" /></button></div><div className="dashboard-grid"><div className="panel chart-panel"><div className="panel-header"><div><h2>Complaint volume</h2><p>All departments · Last 30 days</p></div><button className="select-button" onClick={() => notify('Showing complaint volume for the last 30 days.')}>Last 30 days <ChevronDown /></button></div><div className="chart-area"><div className="chart-y"><span>120</span><span>80</span><span>40</span><span>0</span></div><div className="chart-lines"><span /><span /><span /><span /><svg viewBox="0 0 600 170" preserveAspectRatio="none" aria-label="Complaint volume trend"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2264e5" stopOpacity=".16" /><stop offset="100%" stopColor="#2264e5" stopOpacity="0" /></linearGradient></defs><path d="M0,137 C35,128 42,112 70,119 S105,145 135,125 S166,93 195,102 S230,129 258,104 S292,78 320,91 S355,112 383,87 S420,50 445,68 S480,95 510,63 S550,40 600,18 L600,170 L0,170 Z" fill="url(#fill)" /><path d="M0,137 C35,128 42,112 70,119 S105,145 135,125 S166,93 195,102 S230,129 258,104 S292,78 320,91 S355,112 383,87 S420,50 445,68 S480,95 510,63 S550,40 600,18" fill="none" stroke="#2264e5" strokeWidth="3" /></svg><div className="chart-x"><span>May 20</span><span>May 27</span><span>Jun 03</span><span>Jun 10</span><span>Jun 18</span></div></div></div></div><div className="panel breakdown-panel"><div className="panel-header"><div><h2>By category</h2><p>Current open cases</p></div><button className="more-button" onClick={() => notify('Category breakdown options are not available in demo mode.')}><MoreHorizontal /></button></div><div className="donut-wrap"><div className="donut"><div><strong>624</strong><small>open cases</small></div></div><div className="legend-list"><span><i className="legend-swatch blue" />Water supply <b>32%</b></span><span><i className="legend-swatch green" />Sanitation <b>24%</b></span><span><i className="legend-swatch orange" />Roads <b>19%</b></span><span><i className="legend-swatch purple" />Other <b>25%</b></span></div></div></div></div><div className="panel table-panel"><div className="panel-header"><div><h2>Recent complaints</h2><p>{filtered.length} matching complaint{filtered.length === 1 ? '' : 's'}</p></div><div className="table-actions"><button className="filter-button" onClick={() => setShowFilters((open) => !open)}><Filter /> Filters <span>{statusFilter === 'All' ? 0 : 1}</span></button><button className="button button-outline small" onClick={() => { setQuery(''); setStatusFilter('All') }}>Clear <X /></button></div></div>{showFilters && <div className="filter-row"><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status | 'All')}><option>All</option><option>Submitted</option><option>Under review</option><option>Assigned</option><option>In progress</option><option>Resolved</option></select></label></div>}<div className="table-wrap"><table><thead><tr><th>Complaint</th><th>Status</th><th>Location</th><th>Department</th><th>Received</th><th /></tr></thead><tbody>{filtered.map((item) => { const Icon = item.icon; return <tr key={item.id} onClick={() => setSelected(item)}><td><div className="complaint-name"><span className="table-icon"><Icon /></span><span><strong>{item.title}</strong><small>{item.id} · {item.category}</small></span></div></td><td><StatusBadge status={item.status} /></td><td>{item.area}</td><td>{item.department}</td><td>{item.age}</td><td><button className="row-more" aria-label={`Open ${item.id}`} onClick={(event) => { event.stopPropagation(); setSelected(item) }}><MoreHorizontal /></button></td></tr> })}</tbody></table></div></div><div className="bottom-panels"><div className="panel activity-panel"><div className="panel-header"><div><h2>Recent activity</h2><p>Updates from your team</p></div><button className="more-button" onClick={() => notify('Activity feed is up to date.')}><MoreHorizontal /></button></div><div className="activity-list">  <Activity initials="GF" color="blue" text="New public complaint received" time="Just now" /><Activity initials="PS" color="green" text="added a public update to GF-24083" time="34 min ago" /><Activity initials="NR" color="purple" text="approved deadline extension for GF-24072" time="1h ago" /></div></div><div className="panel attention-panel"><div className="attention-head"><span className="attention-icon"><AlertTriangle /></span><div><h2>Needs your attention</h2><p>8 cases are approaching their SLA</p></div></div><button className="attention-row" onClick={() => setSelected(complaints[0])}><span>GF-24072</span><strong>Water supply</strong><span className="due-soon">Due in 42m</span><ArrowRight /></button><button className="attention-row" onClick={() => setSelected(complaints[1])}><span>GF-24065</span><strong>Road damage</strong><span className="overdue">Overdue 2h</span><ArrowRight /></button></div></div></main></section>{selected && <CasePanel complaint={selected} onClose={() => setSelected(null)} />}</div>
}

function Kpi({ title, value, change, icon: Icon, tone, warning }: { title: string; value: string; change: string; icon: typeof Check; tone: string; warning?: boolean }) { return <div className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon /></div><div className="kpi-label">{title}<span className={warning ? 'negative' : 'positive'}>{warning ? '↑ ' : '↑ '}{change}</span></div><strong>{value}</strong><small>vs. previous month</small></div> }
function Activity({ initials, color, text, time }: { initials: string; color: string; text: string; time: string }) { return <div className="activity-item"><span className={`activity-avatar ${color}`}>{initials}</span><p><strong>{text.split(' ').slice(0, 2).join(' ')}</strong> {text.split(' ').slice(2).join(' ')}<small>{time}</small></p></div> }
function CasePanel({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
  const [opened, setOpened] = useState(false)
  return <div className="case-overlay"><aside className="case-panel"><div className="case-top"><div><span className="eyebrow">Complaint details</span><h2>{complaint.trackingId ?? complaint.id}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X /></button></div><div className="case-status"><StatusBadge status={complaint.status} />{complaint.priority && <span className="priority-tag"><span /> {complaint.priority} priority</span>}</div><h3>{complaint.title}</h3>{complaint.domain && <p className="case-domain">Complaint Domain: {complaint.domain}</p>}<p className="case-description">{complaint.details || 'No additional description provided.'}</p><div className="case-meta"><span><MapPin /> {complaint.area || 'Location not provided'}</span><span><Building2 /> {complaint.assignedOfficer || 'No officer assigned'}</span><span><Clock3 /> Submitted {complaint.submittedAt ? new Date(complaint.submittedAt).toLocaleString() : complaint.age}</span></div>{opened && <p className="case-opened-note" role="status">Full case view opened for {complaint.trackingId ?? complaint.id}.</p>}<button className="button button-primary full" onClick={() => setOpened(true)}>{opened ? 'Case is open' : 'Open full case'} <ArrowRight /></button></aside></div>
}

export default function Page() { const [portal, setPortal] = useState<'citizen' | 'staff'>('citizen'); return <><div className="portal-switcher"><button className={portal === 'citizen' ? 'selected' : ''} onClick={() => setPortal('citizen')}><House /> Citizen portal</button><button className={portal === 'staff' ? 'selected' : ''} onClick={() => setPortal('staff')}><BarChart3 /> Staff workspace</button></div>{portal === 'citizen' ? <CitizenLanding onEmployee={() => setPortal('staff')} /> : <EmployeeDashboard onCitizen={() => setPortal('citizen')} />}</> }
