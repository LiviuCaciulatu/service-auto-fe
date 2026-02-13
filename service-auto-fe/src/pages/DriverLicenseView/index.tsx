import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import '../Home/Home.css'

function renderValue(v: any, depth = 0): React.ReactNode {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return <div className="value-column">{v.map((it, i) => <div key={i} className="value-indent">{renderValue(it, depth + 1)}</div>)}</div>
  if (typeof v === 'object') {
    if (depth > 1) return JSON.stringify(v)
    return <div className="value-column small-gap">{Object.entries(v).map(([k, vv]) => (<div key={k} className="object-row"><div className="object-key">{k}:</div><div>{renderValue(vv, depth + 1)}</div></div>))}</div>
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

export default function DriverLicenseView() {
  const { id: clientId, docId } = useParams<{ id: string; docId: string }>()
  const navigate = useNavigate()
  const [item, setItem] = useState<any | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!docId) return
    setLoading(true)
    setError(null)
    fetch(`/driverLicenses/${docId}`)
      .then(async res => {
        const text = await res.text()
        if (res.ok) {
          try {
            const parsed = JSON.parse(text)
            setItem(parsed)
            // immediately open form for editing and prefill
            setForm({
              first_name: parsed.first_name ?? parsed.firstName ?? '',
              last_name: parsed.last_name ?? parsed.lastName ?? '',
              date_of_birth: parsed.date_of_birth ?? parsed.dateOfBirth ?? '',
              birth_place: parsed.birth_place ?? parsed.birthPlace ?? '',
              issued_date: parsed.issued_date ?? parsed.issuedDate ?? '',
              expiration_date: parsed.expiration_date ?? parsed.expirationDate ?? '',
              issued_by: parsed.issued_by ?? parsed.issuedBy ?? '',
              license_number: parsed.license_number ?? parsed.licenseNumber ?? '',
              vehicle_codes: Array.isArray(parsed.vehicle_codes) ? parsed.vehicle_codes : (parsed.vehicle_codes ? String(parsed.vehicle_codes).split(',').map((s:any)=>s.trim()) : []),
            })
            setEditing(true)
          } catch {
            setItem(text)
          }
        } else {
          setError(`${res.status} ${res.statusText} - ${text}`)
        }
      })
      .catch(e => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false))
  }, [docId])

  return (
    <main className="home-container">
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn back-btn" onClick={() => navigate(`/clients/${clientId}`)}>Back</button>
      </div>
      <h1 className="home-header">Driver License</h1>
      {loading && <div>Loading...</div>}
      {error && <div className="modal-error">{error}</div>}
      {item && !editing && (
        <div className="home-card">
          {Object.entries(item).map(([k, v]) => <FieldRow key={k} k={k} v={v} />)}
        </div>
      )}

      {item && editing && form && (
        <div className="home-card">
          <form onSubmit={(e) => e.preventDefault()}>
            {/** Use explicit handler on Save button to avoid native form submit navigation **/}
            <div className="form-row">
              <label className="form-label">First name</label>
              <input className="form-input" value={form.first_name} onChange={e => setForm((s:any)=>({...s, first_name: e.target.value}))} />
            </div>
            <div className="form-row">
              <label className="form-label">Last name</label>
              <input className="form-input" value={form.last_name} onChange={e => setForm((s:any)=>({...s, last_name: e.target.value}))} />
            </div>
            <div className="form-row">
              <label className="form-label">Date of birth</label>
              <input className="form-input" value={form.date_of_birth} onChange={e => setForm((s:any)=>({...s, date_of_birth: e.target.value}))} />
            </div>
            <div className="form-row">
              <label className="form-label">Birth place</label>
              <input className="form-input" value={form.birth_place} onChange={e => setForm((s:any)=>({...s, birth_place: e.target.value}))} />
            </div>
            <div className="form-row">
              <label className="form-label">Issued date</label>
              <input className="form-input" value={form.issued_date} onChange={e => setForm((s:any)=>({...s, issued_date: e.target.value}))} />
            </div>
            <div className="form-row">
              <label className="form-label">Expiration date</label>
              <input className="form-input" value={form.expiration_date} onChange={e => setForm((s:any)=>({...s, expiration_date: e.target.value}))} />
            </div>
            <div className="form-row">
              <label className="form-label">Issued by</label>
              <input className="form-input" value={form.issued_by} onChange={e => setForm((s:any)=>({...s, issued_by: e.target.value}))} />
            </div>
            <div className="form-row">
              <label className="form-label">License number</label>
              <input className="form-input" value={form.license_number} onChange={e => setForm((s:any)=>({...s, license_number: e.target.value}))} />
            </div>
            <div className="form-row">
              <label className="form-label">Vehicle codes</label>
              <input className="form-input" value={(form.vehicle_codes || []).join(', ')} onChange={e => setForm((s:any)=>({...s, vehicle_codes: e.target.value.split(',').map((p:string)=>p.trim()).filter(Boolean)}))} />
            </div>

            {error && <div className="form-error">Error: {error}</div>}

            <div className="form-actions">
              <button className="btn" type="button" onClick={async () => {
                setError(null)
                try {
                  const payload = { ...form, client_id: clientId }
                  const res = await fetch(`/driverLicenses/${docId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  })
                  if (!res.ok) {
                    const txt = await res.text().catch(()=>'')
                    throw new Error(`${res.status} ${res.statusText} ${txt}`)
                  }
                  const updated = await res.json().catch(()=>null)
                  setItem(updated ?? payload)
                  setEditing(false)
                  setForm(null)
                  // explicitly stay on this view (do not navigate away)
                } catch (err: any) {
                  setError(err?.message ?? String(err))
                }
              }}>Save</button>
              <button className="btn" type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/clients/${clientId}`); }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
