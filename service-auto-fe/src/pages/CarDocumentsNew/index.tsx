import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import '../NewClient/NewClient.css'

type FormData = {
  client_id?: string
  property_A: string
  property_J: string
  property_D_1: string
  property_D_2: string
  property_D_3: string
  property_E: string
  property_K: string
  property_C_2_1: string
  property_C_2_2: string
  property_C_2_3: string
  property_C_3_1: string
  property_C_3_2: string
  property_C_3_3: string
  property_B: string
  property_H: string
  property_I: string
  property_I_1: string
  property_F_1: string
  property_G: string
  property_P_1: string
  property_P_2: string
  property_P_3: string
  property_Q: string
  property_R: string
  property_S_1: string
  property_S_2: string
  property_V_7: string
  property_V_10: string
  property_Y: string
  property_Z: string
  observatii: string
  numar_certificat: string
  property_C_2_equals_C_1: boolean
  property_C_3_equals_C_1: boolean
}

const initial: FormData = {
  client_id: '',
  property_A: '',
  property_J: '',
  property_D_1: '',
  property_D_2: '',
  property_D_3: '',
  property_E: '',
  property_K: '',
  property_C_2_1: '',
  property_C_2_2: '',
  property_C_2_3: '',
  property_C_3_1: '',
  property_C_3_2: '',
  property_C_3_3: '',
  property_B: '',
  property_H: '',
  property_I: '',
  property_I_1: '',
  property_F_1: '',
  property_G: '',
  property_P_1: '',
  property_P_2: '',
  property_P_3: '',
  property_Q: '',
  property_R: '',
  property_S_1: '',
  property_S_2: '',
  property_V_7: '',
  property_V_10: '',
  property_Y: '',
  property_Z: '',
  observatii: '',
  numar_certificat: '',
  property_C_2_equals_C_1: false,
  property_C_3_equals_C_1: false,
}

export default function CarDocumentsNew() {
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
  const [parsedResult, setParsedResult] = useState<any | null>(null)

  useEffect(() => {
    if (id) setForm(s => ({ ...s, client_id: id }))
  }, [id])

  const onChange = (k: keyof FormData, v: string | boolean) => {
    if (typeof v === 'boolean') {
      setForm(s => ({ ...s, [k]: v } as any))
    } else {
      setForm(s => ({ ...s, [k]: v } as any))
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
        return
      }
      const data = await res.json().catch(() => null)
      setUploadResult(data)
      if (data?.url) {
        setStatusMessage('File uploaded — parsing...')
        setProcessing(true)
        try {
          const res2 = await fetch(`/carDocuments/from-file?url=${encodeURIComponent(data.url)}`)
          if (!res2.ok) {
            const text = await res2.text().catch(() => '')
            const msg = `${res2.status} ${res2.statusText}${text ? ' - ' + text.slice(0,200) : ''}`
            setUploadError(msg)
            setStatusMessage(msg)
            return
          }
          const parsed = await res2.json().catch(() => null)
          setParsedResult(parsed)
          console.debug('CarDocuments parsed response:', parsed)
          // merge parsed fields into the form
          const map: Partial<FormData> = {}
          const normalize = (v: any) => (typeof v === 'string' ? (v.split('/').pop() || v) : v)
          const keys: (keyof FormData)[] = [
            'property_A','property_J','property_D_1','property_D_2','property_D_3','property_E','property_K',
            'property_C_2_1','property_C_2_2','property_C_2_3','property_C_3_1','property_C_3_2','property_C_3_3',
            'property_B','property_H','property_I','property_I_1','property_F_1','property_G','property_P_1','property_P_2','property_P_3',
            'property_Q','property_R','property_S_1','property_S_2','property_V_7','property_V_10','property_Y','property_Z',
            'observatii','numar_certificat','property_C_2_equals_C_1','property_C_3_equals_C_1'
          ]
          const boolKeys: (keyof FormData)[] = ['property_C_2_equals_C_1','property_C_3_equals_C_1']

          const lookupParsed = (p: any, key: string) => {
            if (!p) return undefined
            const variants = [
              key,
              key.replace(/^property_/, ''),
              key.replace(/^property_/, '').replace(/_/g, ''),
              key.replace(/^property_/, '').replace(/_/g, ' '),
              key.toLowerCase(),
              key.toUpperCase(),
            ]
            for (const v of variants) {
              if (p[v] !== undefined && p[v] !== null) return p[v]
              if (p.data && p.data[v] !== undefined && p.data[v] !== null) return p.data[v]
              if (p.result && p.result[v] !== undefined && p.result[v] !== null) return p.result[v]
            }
            return undefined
          }

          for (const k of keys) {
            const val = lookupParsed(parsed, k as string)
            if (val !== undefined && val !== null) {
              if (boolKeys.includes(k)) {
                ;(map as any)[k] = Boolean(val)
              } else {
                ;(map as any)[k] = normalize(val)
              }
            }
          }
          console.debug('CarDocuments mapped fields to apply:', map)
          if (Object.keys(map).length > 0) setForm(s => ({ ...s, ...map } as any))
          setStatusMessage('Parsing complete — form updated')
        } catch (err: any) {
          const msg = err?.message ?? 'Failed to process uploaded file'
          setUploadError(msg)
          setStatusMessage(msg)
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
    ['property_A','Property A','text'],['property_J','Property J','text'],['property_D_1','Property D1','text'],
    ['property_D_2','Property D2','text'],['property_D_3','Property D3','text'],['property_E','Property E','text'],
    ['property_K','Property K','text'],['property_C_2_1','C2-1','text'],['property_C_2_2','C2-2','text'],
    ['property_C_2_3','C2-3','text'],['property_C_3_1','C3-1','text'],['property_C_3_2','C3-2','text'],
    ['property_C_3_3','C3-3','text'],['property_B','Property B','text'],['property_H','Property H','text'],
    ['property_I','Property I','text'],['property_I_1','Property I1','text'],['property_F_1','Property F1','text'],
    ['property_G','Property G','text'],['property_P_1','P1','text'],['property_P_2','P2','text'],['property_P_3','P3','text'],
    ['property_Q','Property Q','text'],['property_R','Property R','text'],['property_S_1','S1','text'],
    ['property_S_2','S2','text'],['property_V_7','V7','text'],['property_V_10','V10','text'],
    ['property_Y','Property Y','text'],['property_Z','Property Z','text'],['observatii','Observatii','text'],
    ['numar_certificat','Numar certificat','text']
  ] as any

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const payload: any = { ...form }
      // ensure booleans are actual booleans
      payload.property_C_2_equals_C_1 = !!payload.property_C_2_equals_C_1
      payload.property_C_3_equals_C_1 = !!payload.property_C_3_equals_C_1

      console.log('Submitting car document create:', payload)
      const res = await fetch('/carDocuments', {
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
      await res.json().catch(() => null)
      const targetClientId = payload.client_id || id || form.client_id || null
      if (targetClientId) {
        navigate(`/clients/${targetClientId}`)
      } else {
        navigate(-1)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create car document')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="newclient-container">
      <h1 className="home-header">New Car Document</h1>

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
      {uploadResult && (
        <div className="client-result">
          <strong>Upload response</strong>
          <pre>{JSON.stringify(uploadResult, null, 2)}</pre>
        </div>
      )}
      {parsedResult && (
        <div className="client-result">
          <strong>Parsed response</strong>
          <pre>{JSON.stringify(parsedResult, null, 2)}</pre>
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
              value={(form[f[0] as keyof FormData] as any) ?? ''}
              onChange={e => onChange(f[0], e.target.value)}
            />
          </div>
        ))}

        <div className="form-row">
          <label className="form-label" htmlFor="property_C_2_equals_C_1">C2 equals C1</label>
          <input
            id="property_C_2_equals_C_1"
            type="checkbox"
            checked={!!form.property_C_2_equals_C_1}
            onChange={e => onChange('property_C_2_equals_C_1', e.target.checked)}
          />
        </div>

        <div className="form-row">
          <label className="form-label" htmlFor="property_C_3_equals_C_1">C3 equals C1</label>
          <input
            id="property_C_3_equals_C_1"
            type="checkbox"
            checked={!!form.property_C_3_equals_C_1}
            onChange={e => onChange('property_C_3_equals_C_1', e.target.checked)}
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
