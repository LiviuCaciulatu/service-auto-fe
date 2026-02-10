import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './NewClient.css'

type FormData = {
  first_name: string
  last_name: string
  country: string
  serie: string
  number: string
  nationality: string
  cnp: string
  birthplace: string
  address: string
  issued_by: string
  validity: string
}

const initial: FormData = {
  first_name: '',
  last_name: '',
  country: '',
  serie: '',
  number: '',
  nationality: '',
  cnp: '',
  birthplace: '',
  address: '',
  issued_by: '',
  validity: '',
}

export default function NewClient() {
  const [form, setForm] = useState<FormData>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [clientResult, setClientResult] = useState<any | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    if (!clientResult) return
    const map: Partial<FormData> = {}
    const normalize = (v: any) => {
      if (typeof v !== 'string') return v
      const parts = v.split('/')
      return parts.length > 1 ? parts[parts.length - 1].trim() : v
    }

    const keys: (keyof FormData)[] = ['first_name','last_name','country','serie','number','nationality','cnp','birthplace','address','issued_by','validity']
    for (const k of keys) {
      if (clientResult[k] !== undefined && clientResult[k] !== null) {
        map[k] = normalize(clientResult[k]) as any
      }
    }

    if (Object.keys(map).length > 0) {
      setForm(s => ({ ...s, ...map }))
    }
  }, [clientResult])

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
        return
      }
      const data = await res.json().catch(() => null)
      if (data?.url) {
        setStatusMessage('File uploaded — parsing...')
        setProcessing(true)
        try {
          const res2 = await fetch(`/clients/from-file?url=${encodeURIComponent(data.url)}`)
          if (!res2.ok) {
            const text = await res2.text().catch(() => '')
            const msg = `${res2.status} ${res2.statusText}${text ? ' - ' + text.slice(0,200) : ''}`
            setUploadError(msg)
            setStatusMessage(msg)
            return
          }
          const parsed = await res2.json().catch(() => null)
          setClientResult(parsed)
          setStatusMessage('Parsing complete — form updated')
        } catch (err: any) {
          const msg = err?.message ?? 'Failed to process uploaded file'
          setUploadError(msg)
          setStatusMessage(msg)
        } finally {
          setProcessing(false)
        }
      }
    } catch (err: any) {
      const msg = err?.message ?? 'File upload failed'
      setUploadError(msg)
      setStatusMessage(msg)
    } finally {
      setUploading(false)
    }
  }

  const onDragOverHandler = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const fields: Array<{ name: keyof FormData; label: string; type?: string }> = [
    ['first_name', 'First name', 'text'],
    ['last_name', 'Last name', 'text'],
    ['country', 'Country', 'text'],
    ['serie', 'Serie', 'text'],
    ['number', 'Number', 'text'],
    ['nationality', 'Nationality', 'text'],
    ['cnp', 'CNP', 'text'],
    ['birthplace', 'Birthplace', 'text'],
    ['address', 'Address', 'text'],
    ['issued_by', 'Issued by', 'text'],
    ['validity', 'Validity', 'text'],
  ] as any

  const onChange = (k: keyof FormData, v: string) => setForm(s => ({ ...s, [k]: v }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const payload: any = { ...form }
      if (payload.birthplace !== undefined) {
        payload.birth_place = payload.birthplace
        delete payload.birthplace
      }
      console.log('Submitting client create:', payload)
      const res = await fetch('/clients', {
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
      if (id) navigate(`/clients/${id}`)
      else navigate('/home')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create client')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="newclient-container">
      <h1 className="home-header">New Client</h1>
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
          {processing && <span>Parsing…</span>}
          <span style={{ marginLeft: 8 }}>{statusMessage}</span>
        </div>
      )}
      <form className="newclient-form" onSubmit={onSubmit}>
        {fields.map((f: any) => (
          <div className="form-row" key={f[0]}>
            <label className="form-label" htmlFor={f[0]}>{f[1]}</label>
            <input
              id={f[0]}
              className="form-input"
              type={f[2] ?? 'text'}
              value={form[f[0] as keyof FormData] as string}
              onChange={e => onChange(f[0], e.target.value)}
            />
          </div>
        ))}

        {error && <div className="form-error">Error: {error}</div>}

        <div className="form-actions">
          <button className="btn" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Create Client'}</button>
          <button className="btn" type="button" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </main>
  )
}