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

export default function CarDocumentView() {
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
    fetch(`/carDocuments/${docId}`)
      .then(async res => {
        const text = await res.text()
        if (res.ok) {
          try {
            const parsed = JSON.parse(text)
            setItem(parsed)
            // prefill form and open edit immediately
            setForm(JSON.parse(JSON.stringify(parsed)))
            setEditing(true)
          } catch { setItem(text) }
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
      <h1 className="home-header">Car Document</h1>
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
            {Object.entries(form).map(([k, v]) => (
              <div className="form-row" key={k}>
                <label className="form-label">{k}</label>
                {typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? (
                  <input className="form-input" value={v as any} onChange={e => setForm((s:any)=>({...s, [k]: e.target.value}))} />
                ) : Array.isArray(v) ? (
                  <input className="form-input" value={(v as any).join(', ')} onChange={e => setForm((s:any)=>({...s, [k]: e.target.value.split(',').map((p:string)=>p.trim()).filter(Boolean)}))} />
                ) : (
                  <textarea className="form-input" value={JSON.stringify(v)} onChange={e => {
                    try { setForm((s:any)=>({...s, [k]: JSON.parse(e.target.value)})) } catch { setForm((s:any)=>({...s, [k]: e.target.value})) }
                  }} />
                )}
              </div>
            ))}

            {error && <div className="form-error">Error: {error}</div>}

            <div className="form-actions">
              <button className="btn" type="button" onClick={async () => {
                setError(null)
                try {
                  const payload = { ...form }
                  const res = await fetch(`/carDocuments/${docId}`, {
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
