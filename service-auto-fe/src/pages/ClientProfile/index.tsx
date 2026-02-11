import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import '../Home/Home.css'
import './ClientProfile.css'

type Client = {
  id: number | string
  name?: string
  [key: string]: any
}

const getDisplayName = (c: Client) => {
  const fn = (c as any).first_name ?? (c as any).firstName
  const ln = (c as any).last_name ?? (c as any).lastName
  if (fn || ln) return `${fn ?? ''}${fn && ln ? ' ' : ''}${ln ?? ''}`.trim() || '—'
  if (c.name) {
    const parts = String(c.name).trim().split(/\s+/)
    if (parts.length === 1) return parts[0]
    return `${parts[0]} ${parts[parts.length - 1]}`
  }
  return '—'
}

type FetchResult<T = any> = {
  ok: boolean
  status: number
  statusText: string
  data?: T
  body?: string
}

async function fetchJsonSafe<T = any>(url: string): Promise<FetchResult<T>> {
  try {
    const res = await fetch(url)
    const ct = res.headers.get('content-type') || ''
    const text = await res.clone().text()
    if (res.ok && ct.includes('application/json')) {
      try {
        return { ok: true, status: res.status, statusText: res.statusText, data: JSON.parse(text) }
      } catch {
        return { ok: false, status: res.status, statusText: 'Invalid JSON', body: text }
      }
    }
    return { ok: res.ok, status: res.status, statusText: res.statusText, body: text }
  } catch (err: any) {
    return { ok: false, status: 0, statusText: err?.message ?? 'Network error' }
  }
}

function renderValue(v: any, depth = 0): React.ReactNode {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]'
    return (
      <div className="value-column">
        {v.map((it, i) => (
          <div key={i} className="value-indent">{renderValue(it, depth + 1)}</div>
        ))}
      </div>
    )
  }
  if (typeof v === 'object') {
    if (depth > 1) return JSON.stringify(v)
    return (
      <div className="value-column small-gap">
        {Object.entries(v).map(([k, vv]) => (
          <div key={k} className="object-row">
            <div className="object-key">{k}:</div>
            <div>{renderValue(vv, depth + 1)}</div>
          </div>
        ))}
      </div>
    )
  }
  return String(v)
}

function FieldRow({ k, v }: { k: string; v: any }) {
  return (
    <div className="field-row">
      <div className="field-key">{k}</div>
      <div className="field-value">{renderValue(v)}</div>
    </div>
  )
}

function ClientCard({ client }: { client: Client }) {
  return (
    <div className="home-card">
      <h2 className="cp-heading">{getDisplayName(client)}</h2>
      <h4 className="cp-details-heading">Details</h4>
      <div>
        {Object.entries(client).map(([k, v]) => (
          <FieldRow key={k} k={k} v={v} />
        ))}
      </div>
    </div>
  )
}

function LicenseCard({ license }: { license: any }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const goNew = () => { if (id) navigate(`/client/${id}/driver-license/new`) }

  if (!license || (Array.isArray(license) && license.length === 0)) return (
    <div className="home-card cp-section">
      <h4 className="cp-section-heading">Driver License</h4>
      <div className="section-actions">
        <button className="btn" type="button" onClick={goNew}>New driver license</button>
      </div>
      <div className="section-content">No driver license found.</div>
    </div>
  )

  const items = Array.isArray(license) ? license : [license]

  return (
    <div className="home-card cp-section">
      <h4 className="cp-section-heading">Driver License</h4>
      <div className="section-actions">
        <button className="btn" type="button" onClick={goNew}>New driver license</button>
      </div>
      {items.map((lic: any, idx: number) => (
        <div key={idx} className="doc-item">
          <div className="section-content">{lic && Object.entries(lic).map(([k, v]) => <FieldRow key={k} k={k} v={v} />)}</div>
        </div>
      ))}
    </div>
  )
}

function CarDocsCard({ docs }: { docs: any[] }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const goNew = () => { if (id) navigate(`/client/${id}/car-documents/new`) }

  if (!docs || docs.length === 0) return (
    <div className="home-card cp-section">
      <h4 className="cp-section-heading">Car Documents</h4>
      <div className="section-actions">
        <button className="btn" type="button" onClick={goNew}>New car documents</button>
      </div>
      <div className="section-content">No car documents found.</div>
    </div>
  )

  return (
    <div className="home-card cp-section">
      <h4 className="cp-section-heading">Car Documents</h4>
      <div className="section-actions">
        <button className="btn" type="button" onClick={goNew}>New car documents</button>
      </div>
      {docs.map((doc, i) => (
        <div key={i} className="doc-item">
          <div className="section-content">{Object.entries(doc).map(([k, v]) => <FieldRow key={k} k={k} v={v} />)}</div>
        </div>
      ))}
    </div>
  )
}

function ClaimsCard({ claims }: { claims: any[] }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const goNew = () => { if (id) navigate(`/client/${id}/compensation-claim/new`) }

  if (!claims || claims.length === 0) return (
    <div className="home-card cp-section">
      <h4 className="cp-section-heading">Compensation Claims</h4>
      <div className="section-actions">
        <button className="btn" type="button" onClick={goNew}>Create compensation claim</button>
      </div>
      <div className="section-content">No compensation claims found.</div>
    </div>
  )

  return (
    <div className="home-card cp-section">
      <h4 className="cp-section-heading">Compensation Claims</h4>
      <div className="section-actions">
        <button className="btn" type="button" onClick={goNew}>Create compensation claim</button>
      </div>
      {claims.map((c, i) => (
        <div key={i} className="doc-item">
          <div className="section-content">{Object.entries(c).map(([k, v]) => <FieldRow key={k} k={k} v={v} />)}</div>
        </div>
      ))}
    </div>
  )
}

export default function ClientProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [driverLicense, setDriverLicense] = useState<any | null>(null)
  const [licenseLoading, setLicenseLoading] = useState(false)
  const [licenseError, setLicenseError] = useState<string | null>(null)

  const [carDocuments, setCarDocuments] = useState<any[] | null>(null)
  const [carLoading, setCarLoading] = useState(false)
  const [carError, setCarError] = useState<string | null>(null)

  const [claims, setClaims] = useState<any[] | null>(null)
  const [claimsLoading, setClaimsLoading] = useState(false)
  const [claimsError, setClaimsError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    const loadData = async () => {
      setLoading(true)
      setError(null)

      setLicenseLoading(true)
      setLicenseError(null)
      setCarLoading(true)
      setCarError(null)
      setClaimsLoading(true)
      setClaimsError(null)

      try {
        const [clientRes, licenseRes, carRes, claimsRes] = await Promise.all([
          fetchJsonSafe(`/clients/${id}`),
          fetchJsonSafe(`/clients/${id}/driver-license`),
          fetchJsonSafe(`/clients/${id}/car-documents`),
          fetchJsonSafe(`/clients/${id}/compensation-claims`),
        ])

        if (!clientRes.ok) {
          throw new Error(`Client: ${clientRes.status} ${clientRes.statusText} ${clientRes.body ? '- ' + clientRes.body.slice(0,200) : ''}`)
        }
        setClient(clientRes.data)

        // license
        if (licenseRes.ok) setDriverLicense(licenseRes.data)
        else if (licenseRes.status === 400) setDriverLicense(null), setLicenseError('Driver license not found')
        else setLicenseError(`${licenseRes.status} ${licenseRes.statusText}${licenseRes.body ? ' - ' + licenseRes.body.slice(0,200) : ''}`)

        // car docs
        if (carRes.ok) setCarDocuments(Array.isArray(carRes.data) ? carRes.data : [carRes.data])
        else if (carRes.status === 400) setCarDocuments(null), setCarError('Car documents not found')
        else setCarError(`${carRes.status} ${carRes.statusText}${carRes.body ? ' - ' + carRes.body.slice(0,200) : ''}`)

        // claims
        if (claimsRes.ok) setClaims(Array.isArray(claimsRes.data) ? claimsRes.data : [claimsRes.data])
        else if (claimsRes.status === 400) setClaims(null), setClaimsError('Compensation claims not found')
        else setClaimsError(`${claimsRes.status} ${claimsRes.statusText}${claimsRes.body ? ' - ' + claimsRes.body.slice(0,200) : ''}`)
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load client')
      } finally {
        setLoading(false)
        setLicenseLoading(false)
        setCarLoading(false)
        setClaimsLoading(false)
      }
    }

    loadData()
  }, [id])

  return (
    <main className="home-container">
      <button className="btn back-btn" onClick={() => navigate('/home')}>Home</button>
      {loading && <div>Loading client...</div>}
      {error && <div className="modal-error">Error: {error}</div>}

      {client && <ClientCard client={client} />}

      {licenseLoading && <div>Loading driver license...</div>}
      {licenseError && <div className="modal-error">{licenseError}</div>}
      {driverLicense && <LicenseCard license={driverLicense} />}

      {carLoading && <div>Loading car documents...</div>}
      {carError && <div className="modal-error">{carError}</div>}
      {carDocuments && <CarDocsCard docs={carDocuments} />}

      {claimsLoading && <div>Loading compensation claims...</div>}
      {claimsError && <div className="modal-error">{claimsError}</div>}
      {claims && <ClaimsCard claims={claims} />}
    </main>
  )
}
