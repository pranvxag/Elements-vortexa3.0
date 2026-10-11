'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  Clock3,
  Droplets,
  FileText,
  House,
  Lightbulb,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Status = 'Submitted' | 'Under review' | 'Assigned' | 'In progress' | 'Resolved'

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

type Complaint = {
  id: string
  title: string
  category: string
  status: Status
  area: string
  department: string
  createdAt: string
  details: string | null
  latitude: number
  longitude: number
  icon: LucideIcon
}

const statuses: Status[] = ['Submitted', 'Under review', 'Assigned', 'In progress', 'Resolved']
const departmentIcons: Record<string, LucideIcon> = {
  'Water & Utilities': Droplets,
  Sanitation: Trash2,
  'Street Services': Lightbulb,
  'Public Works': Building2,
}

function departmentFor(category: string) {
  const value = category.toLowerCase()
  if (value.includes('water') || value.includes('drain') || value.includes('sewage')) return 'Water & Utilities'
  if (value.includes('garbage') || value.includes('sanitation') || value.includes('collection')) return 'Sanitation'
  if (value.includes('light')) return 'Street Services'
  return 'Public Works'
}

function iconFor(category: string) {
  const value = category.toLowerCase()
  if (value.includes('water') || value.includes('drain') || value.includes('sewage')) return Droplets
  if (value.includes('light')) return Lightbulb
  if (value.includes('garbage') || value.includes('sanitation') || value.includes('collection')) return Trash2
  return Building2
}

function validStatus(status: string): Status {
  return statuses.includes(status as Status) ? status as Status : 'Submitted'
}

function ageFor(createdAt: string) {
  const timestamp = new Date(createdAt).getTime()
  if (!Number.isFinite(timestamp)) return 'Date unavailable'
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000))
  if (hours < 1) return 'Just now'
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

function complaintFromRecord(record: ComplaintRecord): Complaint {
  return {
    id: record.tracking_id,
    title: record.title,
    category: record.category,
    status: validStatus(record.status),
    area: record.location_text || `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`,
    department: departmentFor(record.category),
    createdAt: record.created_at,
    details: record.details,
    latitude: record.latitude,
    longitude: record.longitude,
    icon: iconFor(record.category),
  }
}

function Logo() {
  return <div className="brand"><span className="brand-mark"><ShieldCheck /></span><span>GovFix <em>Civic</em></span></div>
}

function StatusBadge({ status }: { status: Status }) {
  const tone = status === 'Resolved' ? 'success' : status === 'In progress' ? 'info' : status === 'Under review' ? 'warning' : 'neutral'
  return <span className={`status-badge ${tone}`}><span className="status-dot" />{status}</span>
}

function TableRows({ complaints, onSelect }: { complaints: Complaint[]; onSelect: (complaint: Complaint) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Complaint</th><th>Status</th><th>Location</th><th>Department</th><th>Received</th><th /></tr></thead><tbody>
    {complaints.map((item) => {
      const Icon = item.icon
      return <tr key={item.id} onClick={() => onSelect(item)}><td><div className="complaint-name"><span className="table-icon"><Icon /></span><span><strong>{item.title}</strong><small>{item.id} · {item.category}</small></span></div></td><td><StatusBadge status={item.status} /></td><td>{item.area}</td><td>{item.department}</td><td>{ageFor(item.createdAt)}</td><td><button className="row-more" aria-label={`Open ${item.id}`} onClick={(event) => { event.stopPropagation(); onSelect(item) }}><ArrowRight /></button></td></tr>
    })}
  </tbody></table>{complaints.length === 0 && <div className="empty-state"><FileText /><strong>No complaints found</strong><span>Try changing your search or filters.</span></div>}</div>
}

function ComplaintsWorkspace({ complaints, query, setQuery, statusFilter, setStatusFilter, departmentFilter, setDepartmentFilter, categoryFilter, setCategoryFilter, departments, categories, onSelect }: {
  complaints: Complaint[]
  query: string
  setQuery: (query: string) => void
  statusFilter: Status | 'All'
  setStatusFilter: (status: Status | 'All') => void
  departmentFilter: string
  setDepartmentFilter: (department: string) => void
  categoryFilter: string
  setCategoryFilter: (category: string) => void
  departments: string[]
  categories: string[]
  onSelect: (complaint: Complaint) => void
}) {
  const filtered = complaints.filter((item) =>
    (statusFilter === 'All' || item.status === statusFilter)
    && (!departmentFilter || item.department === departmentFilter)
    && (!categoryFilter || item.category === categoryFilter)
    && `${item.title} ${item.id} ${item.category} ${item.area}`.toLowerCase().includes(query.toLowerCase()),
  )

  return <div className="workspace-view"><div className="view-heading"><div><span className="eyebrow">Case management</span><h1>Complaints</h1><p>Search and review reports submitted through the public portal.</p></div><span className="live-data-label"><i /> {complaints.length} live reports</span></div>
    <div className="panel complaints-toolbar"><div className="search-box"><Search /><input aria-label="Search all complaints" placeholder="Search by title, ID, category, or area..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <label className="toolbar-filter">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status | 'All')}><option>All</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label className="toolbar-filter">Department<select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="">All</option>{departments.map((department) => <option key={department}>{department}</option>)}</select></label>
      <label className="toolbar-filter">Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <span className="result-count">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
    </div>
    <div className="panel full-complaints-panel"><TableRows complaints={filtered} onSelect={onSelect} /></div>
  </div>
}

function GoogleComplaintMap({ complaints, focusedComplaint, onSelect }: { complaints: Complaint[]; focusedComplaint: Complaint | null; onSelect: (complaint: Complaint) => void }) {
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
        center: { lat: 0, lng: 0 },
        zoom: 2,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      })
      setMapReady(true)
    }).catch(() => {
      if (!cancelled) setMapError('Google Maps could not load. Check that Maps JavaScript API is enabled for your key.')
    })
    return () => { cancelled = true }
  }, [apiKey])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = complaints.map((item) => {
      const marker = new google.maps.Marker({
        map: mapRef.current!,
        position: { lat: item.latitude, lng: item.longitude },
        title: `${item.id} · ${item.title}`,
      })
      marker.addListener('click', () => onSelect(item))
      return marker
    })
    if (complaints.length) {
      const bounds = new google.maps.LatLngBounds()
      complaints.forEach((item) => bounds.extend({ lat: item.latitude, lng: item.longitude }))
      mapRef.current.fitBounds(bounds, 80)
    }
    return () => markersRef.current.forEach((marker) => marker.setMap(null))
  }, [complaints, mapReady, onSelect])

  useEffect(() => {
    if (!mapReady || !mapRef.current || !focusedComplaint) return
    mapRef.current.panTo({ lat: focusedComplaint.latitude, lng: focusedComplaint.longitude })
    mapRef.current.setZoom(17)
  }, [focusedComplaint, mapReady])

  if (!apiKey) return <div className="google-map-config"><MapPin /><strong>Google Maps is not configured</strong><span>Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to <code>.env.local</code>, then restart the app.</span></div>
  if (mapError) return <div className="google-map-config error"><MapPin /><strong>Map unavailable</strong><span>{mapError}</span></div>
  return <div ref={mapElement} className="google-map" aria-label="Live complaint locations map" />
}

function MapWorkspace({ complaints, onSelect }: { complaints: Complaint[]; onSelect: (complaint: Complaint) => void }) {
  const [category, setCategory] = useState('All')
  const [focusedComplaint, setFocusedComplaint] = useState<Complaint | null>(null)
  const categories = Array.from(new Set(complaints.map((item) => item.category))).sort()
  const visible = complaints.filter((item) => category === 'All' || item.category === category)
  const selectComplaint = (complaint: Complaint) => {
    setFocusedComplaint(complaint)
    onSelect(complaint)
  }

  return <div className="workspace-view"><div className="view-heading"><div><span className="eyebrow">Live service map</span><h1>Map intelligence</h1><p>Explore locations from reports submitted through the public portal.</p></div><span className="live-data-label"><i /> {visible.length} mapped reports</span></div>
    <div className="map-intelligence-grid"><div className="panel intelligence-map"><GoogleComplaintMap complaints={visible} focusedComplaint={focusedComplaint} onSelect={selectComplaint} /><div className="map-footer"><span><i className="legend-dot blue" /> {visible.length} visible reports</span><span>Select a marker or report to open details</span></div></div>
      <div className="panel map-report-list"><div className="panel-header"><div><h2>Reports on map</h2><p>Filter by issue category</p></div><MapPin /></div>
        <div className="map-category-list"><button className={category === 'All' ? 'selected' : ''} onClick={() => setCategory('All')}>All reports<span>{complaints.length}</span></button>{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}<span>{complaints.filter((complaint) => complaint.category === item).length}</span></button>)}</div>
        <div className="map-case-list">{visible.map((item) => <button key={item.id} className={focusedComplaint?.id === item.id ? 'selected' : ''} onClick={() => selectComplaint(item)}><span><strong>{item.id}</strong><small>{item.title}</small></span><StatusBadge status={item.status} /></button>)}</div>
        {visible.length === 0 && <div className="empty-state"><MapPin /><strong>No reports to map</strong><span>New public submissions will appear here.</span></div>}
      </div>
    </div>
  </div>
}

function DepartmentsWorkspace({ complaints, onOpenDepartment }: { complaints: Complaint[]; onOpenDepartment: (department: string) => void }) {
  const rows = Array.from(new Set(complaints.map((item) => item.department))).sort().map((name) => {
    const reports = complaints.filter((item) => item.department === name)
    return {
      name,
      total: reports.length,
      active: reports.filter((item) => item.status !== 'Resolved').length,
      resolved: reports.filter((item) => item.status === 'Resolved').length,
      icon: departmentIcons[name] || Building2,
    }
  })

  return <div className="workspace-view"><div className="view-heading"><div><span className="eyebrow">City operations</span><h1>Departments</h1><p>Department workload is grouped from the categories in live public reports.</p></div><span className="live-data-label"><i /> {rows.length} departments with reports</span></div>
    {rows.length ? <div className="department-grid">{rows.map(({ name, total, active, resolved, icon: Icon }) => <article key={name} className="panel department-card"><div className="department-card-head"><span className="kpi-icon blue"><Icon /></span><span className="department-status"><i /> Live workload</span></div><h2>{name}</h2><p>{total} report{total === 1 ? '' : 's'} submitted</p><div className="department-metrics"><span><strong>{active}</strong><small>open reports</small></span><span><strong>{resolved}</strong><small>resolved</small></span><span><strong>{total ? Math.round((resolved / total) * 100) : 0}%</strong><small>resolved share</small></span></div><div className="department-progress"><span style={{ width: `${total ? (resolved / total) * 100 : 0}%` }} /></div><button className="department-card-action live-department-action" onClick={() => onOpenDepartment(name)}>View these complaints <ArrowRight /></button></article>)}</div>
      : <div className="panel empty-state"><Building2 /><strong>No department reports yet</strong><span>Departments will appear when public complaints are submitted.</span></div>}
  </div>
}

function Overview({ complaints, isLoading, onOpenComplaint, onOpenComplaints }: { complaints: Complaint[]; isLoading: boolean; onOpenComplaint: (complaint: Complaint) => void; onOpenComplaints: (status: Status | 'All', category?: string) => void }) {
  const resolvedCount = complaints.filter((item) => item.status === 'Resolved').length
  const submittedCount = complaints.filter((item) => item.status === 'Submitted').length
  const inProgress = complaints.filter((item) => item.status === 'In progress').length
  const last30Days = Array.from({ length: 30 }, (_, index) => {
    const day = new Date()
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - (29 - index))
    const nextDay = new Date(day)
    nextDay.setDate(nextDay.getDate() + 1)
    return {
      date: day,
      count: complaints.filter((item) => {
        const created = new Date(item.createdAt).getTime()
        return created >= day.getTime() && created < nextDay.getTime()
      }).length,
    }
  })
  const maxDaily = Math.max(1, ...last30Days.map((item) => item.count))
  const points = last30Days.map((item, index) => `${(index / 29) * 600},${150 - (item.count / maxDaily) * 130}`).join(' ')
  const byCategory = Array.from(new Set(complaints.map((item) => item.category))).map((category) => ({
    category,
    count: complaints.filter((item) => item.category === category && item.status !== 'Resolved').length,
  })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count)
  const latest = complaints.slice(0, 5)

  return <div className="workspace-view live-overview"><div className="staff-welcome"><div><span className="eyebrow">Live complaints</span><h1>City service overview</h1><p>Reports submitted through the public portal.</p></div><span className="live-data-label"><i /> {isLoading ? 'Loading reports' : 'Connected to live reports'}</span></div>
    <div className="kpi-grid"><button className="kpi-card-button" onClick={() => onOpenComplaints('All')}><Kpi title="Total complaints" value={complaints.length} icon={FileText} tone="blue" /></button>
      <button className="kpi-card-button" onClick={() => onOpenComplaints('Submitted')}><Kpi title="Submitted" value={submittedCount} icon={AlertTriangle} tone="orange" /></button>
      <button className="kpi-card-button" onClick={() => onOpenComplaints('In progress')}><Kpi title="In progress" value={inProgress} icon={Clock3} tone="purple" /></button>
      <button className="kpi-card-button" onClick={() => onOpenComplaints('Resolved')}><Kpi title="Resolved" value={resolvedCount} icon={Check} tone="green" /></button>
    </div>
    <div className="dashboard-grid"><div className="panel chart-panel"><div className="panel-header"><div><h2>Complaint volume</h2><p>Public submissions · Last 30 days</p></div></div>
        {complaints.length ? <div className="live-chart-wrap"><svg viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-label="Daily complaints submitted during the last 30 days"><line x1="0" y1="150" x2="600" y2="150" /><polyline points={points} /></svg><div className="chart-x"><span>{last30Days[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>{last30Days[9].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>{last30Days[19].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span><span>{last30Days[29].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div></div>
          : <div className="empty-state"><FileText /><strong>No complaint activity yet</strong><span>Public submissions will populate this chart.</span></div>}
      </div>
      <div className="panel breakdown-panel"><div className="panel-header"><div><h2>Open by category</h2><p>From current public reports</p></div></div>
        <div className="live-category-list">{byCategory.length ? byCategory.map(({ category, count }) => <button key={category} onClick={() => onOpenComplaints('All', category)}><span>{category}</span><strong>{count}</strong></button>) : <div className="empty-state"><FileText /><strong>No open reports</strong><span>All current reports are resolved, or no reports have been submitted.</span></div>}</div>
      </div>
    </div>
    <div className="panel table-panel"><div className="panel-header"><div><h2>Recent complaints</h2><p>Newest reports submitted through the public portal</p></div><button className="button button-outline small" onClick={() => onOpenComplaints('All')}>View all <ArrowRight /></button></div>
      {latest.length ? <TableRows complaints={latest} onSelect={onOpenComplaint} /> : <div className="empty-state"><FileText /><strong>{isLoading ? 'Loading public reports' : 'No public complaints yet'}</strong><span>When someone submits a report, it will appear here.</span></div>}
    </div>
  </div>
}

function Kpi({ title, value, icon: Icon, tone }: { title: string; value: number; icon: LucideIcon; tone: string }) {
  return <div className="kpi-card"><div className={`kpi-icon ${tone}`}><Icon /></div><div className="kpi-label">{title}</div><strong>{value.toLocaleString()}</strong><small>From public complaints</small></div>
}

function CasePanel({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
  return <div className="case-overlay" role="presentation" onClick={onClose}><aside className="case-panel" role="dialog" aria-modal="true" aria-labelledby="case-title" onClick={(event) => event.stopPropagation()}>
    <div className="case-top"><div><span className="eyebrow">Complaint details</span><h2 id="case-title">{complaint.id}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X /></button></div>
    <div className="case-status"><StatusBadge status={complaint.status} /></div><h3>{complaint.title}</h3>
    <p className="case-description">{complaint.details || 'No additional details were provided with this report.'}</p>
    <div className="case-meta"><span><MapPin /> {complaint.area}</span><span><Building2 /> {complaint.department}</span><span><Clock3 /> Received {ageFor(complaint.createdAt)}</span><span><FileText /> {complaint.category}</span></div>
    <div className="case-section"><div className="case-section-title">Report location</div><p className="case-description">{complaint.latitude.toFixed(6)}, {complaint.longitude.toFixed(6)}</p></div>
  </aside></div>
}

export default function StaffWorkspace({ onCitizen }: { onCitizen: () => void }) {
  const [activeTab, setActiveTab] = useState('Overview')
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<Status | 'All'>('All')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selected, setSelected] = useState<Complaint | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const loadComplaints = useCallback(async (showLoading = false) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    if (showLoading) setIsLoading(true)
    try {
      const response = await fetch('/api/complaints', { cache: 'no-store', signal: controller.signal })
      const result = await response.json() as ComplaintRecord[] | { error?: string }
      if (!response.ok) throw new Error(!Array.isArray(result) && result.error ? result.error : 'The complaints could not be loaded.')
      if (!Array.isArray(result)) throw new Error('The complaints service returned an invalid response.')
      setComplaints(result.map(complaintFromRecord))
      setLoadError('')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setLoadError(error instanceof Error ? error.message : 'The complaints could not be loaded.')
    } finally {
      if (!controller.signal.aborted) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadComplaints(true)
    const interval = window.setInterval(() => { void loadComplaints() }, 30_000)
    return () => {
      window.clearInterval(interval)
      requestRef.current?.abort()
    }
  }, [loadComplaints])

  const departments = useMemo(() => Array.from(new Set(complaints.map((item) => item.department))).sort(), [complaints])
  const categories = useMemo(() => Array.from(new Set(complaints.map((item) => item.category))).sort(), [complaints])

  const openComplaints = (status: Status | 'All', category?: string) => {
    setStatusFilter(status)
    setDepartmentFilter('')
    setCategoryFilter(category || '')
    setActiveTab('Complaints')
  }

  const openDepartment = (department: string) => {
    setDepartmentFilter(department)
    setStatusFilter('All')
    setCategoryFilter('')
    setActiveTab('Complaints')
  }

  const tabItems = [
    { label: 'Overview', icon: BarChart3 },
    { label: 'Complaints', icon: FileText },
    { label: 'Map intelligence', icon: MapPin },
    { label: 'Departments', icon: Building2 },
  ]

  return <div className="staff-shell"><aside className="sidebar"><div className="sidebar-brand"><Logo /></div>
    <div className="demo-label live-workspace-label"><span className="live-dot" /> Live workspace</div>
    <nav className="side-nav" aria-label="Staff workspace">{tabItems.map(({ label, icon: Icon }) => <button key={label} className={activeTab === label ? 'active' : ''} aria-current={activeTab === label ? 'page' : undefined} onClick={() => setActiveTab(label)}><Icon />{label}{label === 'Complaints' && <span className="nav-count">{complaints.length}</span>}</button>)}</nav>
    <div className="sidebar-bottom"><button className="sidebar-switch" onClick={onCitizen}><House /> Public portal</button></div>
  </aside><section className="staff-main"><header className="staff-header"><div className="mobile-staff-title"><Logo /></div><div className="breadcrumbs"><span>Workspace</span><ArrowRight /><strong>{activeTab}</strong></div>
    <div className="staff-header-actions">{activeTab === 'Complaints' && <div className="search-box"><Search /><input aria-label="Search complaints" placeholder="Search complaints..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>}<button className="icon-button" aria-label="Refresh live complaints" onClick={() => { void loadComplaints(true) }} disabled={isLoading}><RefreshCw /></button></div>
  </header><main className="staff-content">
    {loadError && <div className="live-data-error" role="alert"><AlertTriangle /><span>{loadError}</span><button onClick={() => { void loadComplaints(true) }}>Retry</button></div>}
    {activeTab === 'Overview' && <Overview complaints={complaints} isLoading={isLoading} onOpenComplaint={setSelected} onOpenComplaints={openComplaints} />}
    {activeTab === 'Complaints' && <ComplaintsWorkspace complaints={complaints} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} departmentFilter={departmentFilter} setDepartmentFilter={setDepartmentFilter} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} departments={departments} categories={categories} onSelect={setSelected} />}
    {activeTab === 'Map intelligence' && <MapWorkspace complaints={complaints} onSelect={setSelected} />}
    {activeTab === 'Departments' && <DepartmentsWorkspace complaints={complaints} onOpenDepartment={openDepartment} />}
    {selected && <CasePanel complaint={selected} onClose={() => setSelected(null)} />}
  </main></section></div>
}
