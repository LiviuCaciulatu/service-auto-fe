import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import '../NewClient/NewClient.css'

type FormData = {
  first_name: string
  last_name: string
  date_of_birth: string
  birth_place: string
  issued_date: string
  expiration_date: string
  issued_by: string
  license_number: string
  vehicle_codes: string[]
  client_id?: string
}

const initial: FormData = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  birth_place: '',
  issued_date: '',
  expiration_date: '',
  issued_by: '',
  license_number: '',
  vehicle_codes: [],
  client_id: '',
}

export default function DriverLicenseNew() {
  const [form, setForm] = useState<FormData>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { id } = useParams() as { id?: string }
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadResult, setUploadResult] = useState<any | null>(null)
  const [driverResult, setDriverResult] = useState<any | null>(null)

  const onChange = (k: keyof FormData, v: string) => {
    if (k === 'vehicle_codes') {
      const parts = v.split(',').map(p => p.trim()).filter(Boolean)
      setForm(s => ({ ...s, vehicle_codes: parts }))
    } else {
      setForm(s => ({ ...s, [k]: v } as any))
    }
  }

  useEffect(() => {
    if (id) setForm(s => ({ ...s, client_id: id } as any))
  }, [id])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const payload: any = { ...form }
      // ensure vehicle_codes is an array
      if (!Array.isArray(payload.vehicle_codes)) {
        payload.vehicle_codes = (payload.vehicle_codes || '').split(',').map((s: string) => s.trim()).filter(Boolean)
      }

      console.log('Submitting driver license create:', payload)
      const res = await fetch('/driverLicenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '')
        const msg = `${res.status} ${res.statusText}${bodyText ? ' - ' + bodyText.slice(0,1000) : ''}`
        setError(msg)
        throw new Error(msg)
      }
      const data = await res.json().catch(() => null)
      const id = data?.id ?? data?._id ?? data?.insertedId ?? null
      const targetClientId = payload.client_id || id || form.client_id || null
      if (targetClientId) {
        navigate(`/clients/${targetClientId}`)
      } else if (id) {
        navigate(`/driverLicenses/${id}`)
      } else {
        navigate(-1)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create driver license')
    } finally {
      setSubmitting(false)
    }
  }

  const onDropFiles = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const f = e.dataTransfer?.files?.[0]
    if (f) uploadFile(f)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) uploadFile(f)
  }

  async function uploadFile(file: File) {
    setUploading(true)
    setUploadError(null)
    setStatusMessage('Uploading file...')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/files/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const msg = `${res.status} ${res.statusText}${text ? ' - ' + text.slice(0,200) : ''}`
        setUploadError(msg)
        setStatusMessage(msg)
        setUploadResult({ error: msg })
        return
      }
      const data = await res.json().catch(() => null)
      setUploadResult(data)
      if (data?.url) {
        setStatusMessage('File uploaded — parsing...')
        setProcessing(true)
        try {
          const res2 = await fetch(`/driverLicenses/from-file?url=${encodeURIComponent(data.url)}`)
          if (!res2.ok) {
            const text = await res2.text().catch(() => '')
            const msg = `${res2.status} ${res2.statusText}${text ? ' - ' + text.slice(0,200) : ''}`
            setUploadError(msg)
            setStatusMessage(msg)
            setDriverResult({ error: msg })
            return
          }
          const parsed = await res2.json().catch(() => null)
          setDriverResult(parsed)

          const map: Partial<FormData> = {}
          const normalize = (v: any) => {
            if (typeof v !== 'string') return v
            const parts = v.split('/')
            return parts.length > 1 ? parts[parts.length - 1].trim() : v
          }

          const keys: (keyof FormData)[] = ['first_name','last_name','date_of_birth','birth_place','issued_date','expiration_date','issued_by','license_number','vehicle_codes']
          for (const k of keys) {
            if (parsed && parsed[k] !== undefined && parsed[k] !== null) {
              if (k === 'vehicle_codes' && Array.isArray(parsed[k])) {
                map[k] = parsed[k]
              } else {
                map[k] = normalize(parsed[k]) as any
              }
            }
          }

          if (Object.keys(map).length > 0) setForm(s => ({ ...s, ...map } as any))
          setStatusMessage('Parsing complete — form updated')
        } catch (err: any) {
          const msg = err?.message ?? 'Failed to process uploaded file'
          setUploadError(msg)
          setStatusMessage(msg)
          setDriverResult({ error: msg })
        } finally {
          setProcessing(false)
        }
      } else {
        setStatusMessage('Upload complete')
      }
    } catch (err: any) {
      const msg = err?.message ?? 'File upload failed'
      setUploadError(msg)
      setStatusMessage(msg)
    } finally {
      setUploading(false)
      setProcessing(false)
    }
  }

  const onDragOverHandler = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const fields: Array<{ name: keyof FormData; label: string; type?: string }> = [
    ['first_name', 'First name', 'text'],
    ['last_name', 'Last name', 'text'],
    ['date_of_birth', 'Date of birth', 'text'],
    ['birth_place', 'Birth place', 'text'],
    ['issued_date', 'Issued date', 'text'],
    ['expiration_date', 'Expiration date', 'text'],
    ['issued_by', 'Issued by', 'text'],
    ['license_number', 'License number', 'text'],
  ] as any

  return (
    <main className="newclient-container">
      <h1 className="home-header">New Driver License</h1>

      <div
        className="upload-area"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={onDragOverHandler}
        onDrop={onDropFiles}
      >
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={onFileChange} />
        <div className="upload-text">Drag & drop a file here, or click to select</div>
      </div>
      {statusMessage && (
        <div className="status-banner">
          {uploading && <span>Uploading…</span>}
          {processing && <span>Processing…</span>}
          <span style={{ marginLeft: 8 }}>{statusMessage}</span>
        </div>
      )}
      {uploadError && <div className="upload-error">{uploadError}</div>}
      {/* upload and parsed responses are intentionally not displayed */}

      <form className="newclient-form" onSubmit={onSubmit}>
        {fields.map((f: any) => (
          <div className="form-row" key={f[0]}>
            <label className="form-label" htmlFor={f[0]}>{f[1]}</label>
            <input
              id={f[0]}
              className="form-input"
              type={f[2] ?? 'text'}
              value={(form[f[0] as keyof FormData] as any) ?? ''}
              onChange={e => onChange(f[0], e.target.value)}
            />
          </div>
        ))}

        <div className="form-row">
          <label className="form-label" htmlFor="vehicle_codes">Vehicle codes</label>
          <input
            id="vehicle_codes"
            className="form-input"
            type="text"
            placeholder="e.g. B, C, D (comma-separated)"
            value={form.vehicle_codes.join(', ')}
            onChange={e => onChange('vehicle_codes', e.target.value)}
          />
        </div>

        {error && <div className="form-error">Error: {error}</div>}

        <div className="form-actions">
          <button className="btn" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Create'}</button>
          <button className="btn" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </main>
  )
}
