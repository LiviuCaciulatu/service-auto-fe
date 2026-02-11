import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import '../ClientProfile/ClientProfile.css'
import './CompensationClaimNew.css'
import ClaimTemplate from '../../templates/claim/v1/template'
import { mapClaim } from '../../templates/claim/v1/mapping'

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

export default function CompensationClaimNew() {
  const { id } = useParams() as { id?: string }
  const navigate = useNavigate()

  const [client, setClient] = useState<any | null>(null)
  const [clientLoading, setClientLoading] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  const [carDocs, setCarDocs] = useState<any[] | null>(null)
  const [carLoading, setCarLoading] = useState(false)
  const [carError, setCarError] = useState<string | null>(null)
  const [formState, setFormState] = useState<Record<string, any> | null>(null)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<any | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      setClientLoading(true)
      setClientError(null)
      setCarLoading(true)
      setCarError(null)
      try {
        const [cRes, carRes] = await Promise.all([
          fetchJsonSafe(`/clients/${id}`),
          fetchJsonSafe(`/clients/${id}/car-documents`),
        ])
        if (!cRes.ok) {
          throw new Error(`Client: ${cRes.status} ${cRes.statusText}${cRes.body ? ' - ' + cRes.body.slice(0,200) : ''}`)
        }
        setClient(cRes.data)
        // initialize editable form state from client + first car doc
        const initial: Record<string, any> = { ...(cRes.data ?? {}) }
        let firstDoc: Record<string, any> | null = null
        if (carRes.ok) {
          const docs = Array.isArray(carRes.data) ? carRes.data : [carRes.data]
          if (docs.length) {
            firstDoc = docs[0]
            Object.assign(initial, docs[0])
          }
        }

        // Autocomplete mappings requested:
        // claimant_name = last_name + ' ' + first_name
        const last = (cRes.data && (cRes.data.last_name ?? cRes.data.lastname ?? cRes.data.surname)) || ''
        const first = (cRes.data && (cRes.data.first_name ?? cRes.data.firstname ?? cRes.data.given_name)) || ''
        const claimant = `${last} ${first}`.trim()
        if (claimant) initial.claimant_name = claimant
        if (cRes.data && cRes.data.cnp) initial.cnp = cRes.data.cnp
        // default signature to claimant name when missing
        if (!initial.signature && claimant) initial.signature = claimant

        // vehicle fields from first car document (if present)
        if (firstDoc) {
          if (firstDoc.property_d_1) initial.vehicle_make = firstDoc.property_d_1
          if (firstDoc.property_d_3) initial.vehicle_model = firstDoc.property_d_3
          if (firstDoc.property_b) initial.registration_number = firstDoc.property_b
        }

        // date: default to today (ISO yyyy-mm-dd) for display; will be sent as string
        if (!initial.date) {
          const today = new Date()
          const iso = today.toISOString().slice(0, 10)
          initial.date = iso
        }

        // normalize payments into compensated_clients array
        const payments = initial.compensated_clients ?? (
          (initial.amount || initial.bank || initial.iban || initial.account_holder)
            ? [{ amount: initial.amount ?? '', bank: initial.bank ?? '', iban: initial.iban ?? '', account_holder: initial.account_holder ?? '' }]
            : []
        )
        initial.compensated_clients = payments
        // remove legacy single-payment keys
        delete initial.amount
        delete initial.bank
        delete initial.iban
        delete initial.account_holder
        setFormState(initial)

        if (carRes.ok) setCarDocs(Array.isArray(carRes.data) ? carRes.data : [carRes.data])
        else if (carRes.status === 400) setCarDocs(null), setCarError('Car documents not found')
        else setCarError(`${carRes.status} ${carRes.statusText}${carRes.body ? ' - ' + carRes.body.slice(0,200) : ''}`)
      } catch (err: any) {
        setClientError(err?.message ?? 'Failed to load')
      } finally {
        setClientLoading(false)
        setCarLoading(false)
      }
    }
    load()
  }, [id])

  function buildPayload() {
    const fs = formState ?? {}
    return {
      client_id: id ?? null,
      attention_to: fs.attention_to ?? '',
      claim_file_number: fs.claim_file_number ?? fs.claim_number ?? '',
      claimant_name: fs.claimant_name ?? '',
      cnp: fs.cnp ?? '',
      role: fs.role ?? '',
      vehicle_make: fs.vehicle_make ?? '',
      vehicle_model: fs.vehicle_model ?? '',
      registration_number: fs.registration_number ?? '',
      claim_number: fs.claim_number ?? '',
      observations: fs.observations ?? '',
      date: fs.date ?? '',
      signature: fs.signature ?? '',
      compensated_clients: (fs.compensated_clients ?? []).map((c: any) => ({
        amount: String(c.amount ?? ''),
        bank: c.bank ?? '',
        iban: c.iban ?? '',
        account_holder: c.account_holder ?? ''
      }))
    }
  }

  async function sendClaim() {
    setSending(true)
    setSendResult(null)
    try {
      const payload = buildPayload()
      console.log('Sending compensation claim payload:', payload)
      const res = await fetch('/compensationClaims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const text = await res.text()
      console.log('compensationClaims response text:', text)
      let body: any = text
      try { body = JSON.parse(text) } catch {}
      setSendResult({ ok: res.ok, status: res.status, body })
      if (res.ok) {
        const id = body?.id ?? body?.data?.id ?? body?._id ?? null
        if (id) setCreatedId(String(id))
      }
    } catch (err: any) {
      setSendResult({ ok: false, error: err?.message ?? String(err) })
    } finally {
      setSending(false)
    }
  }

  async function downloadPdf() {
    setDownloading(true)
    try {
      const payload = buildPayload()
      if (!createdId) {
        setSendResult({ ok: false, error: 'No saved claim id — please Save before downloading PDF.' })
        return
      }
      // First, fetch the saved claim resource from backend
      const claimRes = await fetch(`/compensationClaims/${createdId}`)
      let claimJson: any = null
      if (claimRes.ok) {
        try { claimJson = await claimRes.json() } catch {}
      }

      // Try to GET a generated PDF endpoint first
      const res = await fetch(`/compensationClaims/${createdId}/pdf`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const baseName = payload.claim_number || payload.claim_file_number || 'claim'
        a.download = `claim-${baseName}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } else if (res.status === 404) {
        // No server-side PDF endpoint. Fall back to client-side HTML->PDF generation
        try {
          const baseName = payload.claim_number || payload.claim_file_number || 'claim'
          const { htmlToPdf } = await import('../../utils/htmlToPdf')
          await htmlToPdf('.preview-container .preview-scale', `claim-${baseName}.pdf`)
        } catch (e: any) {
          throw new Error('Client PDF generation failed: ' + (e?.message ?? String(e)))
        }
      } else {
        const txt = await res.text().catch(() => '')
        throw new Error(`PDF request failed: ${res.status} ${res.statusText} ${txt}`)
      }
    } catch (err: any) {
      setSendResult({ ok: false, error: err?.message ?? String(err) })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <main className="home-container">
      <button className="btn back-btn" onClick={() => navigate(-1)}>Back</button>
      <h1 className="home-header">New Compensation Claim</h1>

      {clientLoading && <div>Loading client...</div>}
      {clientError && <div className="modal-error">Error: {clientError}</div>}

      {carLoading && <div>Loading car documents...</div>}
      {carError && <div className="modal-error">{carError}</div>}

      {client && (
        <div className="comp-claim-wrapper">
          <div className="left-side">
            <h2 className="comp-claim-heading">Editable claim fields</h2>
            <div className="editable-grid">
              <div>
                <label>Attention To</label>
                <input className="input" value={formState?.attention_to ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), attention_to: e.target.value }))} />
              </div>
              <div>
                <label>Claimant name</label>
                <input className="input" value={formState?.claimant_name ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), claimant_name: e.target.value }))} />
              </div>
              <div>
                <label>CNP</label>
                <input className="input" value={formState?.cnp ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), cnp: e.target.value }))} />
              </div>
              <div>
                <label>Role</label>
                <input className="input" value={formState?.role ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), role: e.target.value }))} />
              </div>
              <div>
                <label>Vehicle make</label>
                <input className="input" value={formState?.vehicle_make ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), vehicle_make: e.target.value }))} />
              </div>
              <div>
                <label>Vehicle model</label>
                <input className="input" value={formState?.vehicle_model ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), vehicle_model: e.target.value }))} />
              </div>
              <div>
                <label>Registration number</label>
                <input className="input" value={formState?.registration_number ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), registration_number: e.target.value }))} />
              </div>
              <div>
                <label>Claim number</label>
                <input className="input" value={formState?.claim_number ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), claim_number: e.target.value }))} />
              </div>
              <div className="full-width">
                <label>Observations</label>
                <textarea className="input" rows={4} value={formState?.observations ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), observations: e.target.value }))} />
              </div>
              <div>
                <label>Date</label>
                <input type="date" className="input" value={formState?.date ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), date: e.target.value }))} />
              </div>
              <div>
                <label>Signature</label>
                <input className="input" value={formState?.signature ?? ''} onChange={e => setFormState(s => ({ ...(s ?? {}), signature: e.target.value }))} />
              </div>

              <div className="payment-title">Payment details</div>
              {(formState?.compensated_clients ?? []).map((p: any, idx: number) => (
                <React.Fragment key={idx}>
                  <div>
                    <label>Amount</label>
                    <input className="input" value={p?.amount ?? ''} onChange={e => setFormState(s => {
                      const next = { ...(s ?? {}) }
                      next.compensated_clients = Array.from(next.compensated_clients ?? [])
                      next.compensated_clients[idx] = { ...(next.compensated_clients[idx] ?? {}), amount: e.target.value }
                      return next
                    })} />
                  </div>
                  <div>
                    <label>Bank</label>
                    <input className="input" value={p?.bank ?? ''} onChange={e => setFormState(s => {
                      const next = { ...(s ?? {}) }
                      next.compensated_clients = Array.from(next.compensated_clients ?? [])
                      next.compensated_clients[idx] = { ...(next.compensated_clients[idx] ?? {}), bank: e.target.value }
                      return next
                    })} />
                  </div>
                  <div>
                    <label>IBAN</label>
                    <input className="input" value={p?.iban ?? ''} onChange={e => setFormState(s => {
                      const next = { ...(s ?? {}) }
                      next.compensated_clients = Array.from(next.compensated_clients ?? [])
                      next.compensated_clients[idx] = { ...(next.compensated_clients[idx] ?? {}), iban: e.target.value }
                      return next
                    })} />
                  </div>
                  <div>
                    <label>Account holder</label>
                    <input className="input" value={p?.account_holder ?? ''} onChange={e => setFormState(s => {
                      const next = { ...(s ?? {}) }
                      next.compensated_clients = Array.from(next.compensated_clients ?? [])
                      next.compensated_clients[idx] = { ...(next.compensated_clients[idx] ?? {}), account_holder: e.target.value }
                      return next
                    })} />
                  </div>
                  <div className="button-row-full">
                    <button className="btn" onClick={() => setFormState(s => {
                      const next = { ...(s ?? {}) }
                      next.compensated_clients = Array.from(next.compensated_clients ?? [])
                      next.compensated_clients.splice(idx, 1)
                      return next
                    })}>Remove payment</button>
                  </div>
                </React.Fragment>
              ))}
              <div className="button-row-full">
                <button className="btn" onClick={() => setFormState(s => {
                  const next = { ...(s ?? {}) }
                  next.compensated_clients = Array.from(next.compensated_clients ?? [])
                  next.compensated_clients.push({ amount: '', bank: '', iban: '', account_holder: '' })
                  return next
                })}>Add payment</button>
              </div>
            </div>

            {/* Send payload to backend */}
            <div className="send-row">
              <button className="btn" disabled={sending} onClick={sendClaim}>{sending ? 'Saving…' : 'Save'}</button>
              <button className="btn" disabled={downloading} onClick={downloadPdf}>{downloading ? 'Downloading…' : 'Download PDF'}</button>
            </div>
            
          </div>

          <div className="right-side">
            <div>
              <div className="preview-container">
                <div className="preview-scale">
                  {/* live-merge: include raw form fields and formatted map; prefer explicit derived payment fields for template */}
                  {(() => {
                    const fs = formState ?? {}
                    const firstPay = (fs.compensated_clients && fs.compensated_clients[0]) || {}
                    const previewData = {
                      ...mapClaim(fs),
                      ...fs,
                      amount: firstPay.amount ?? fs.amount ?? '',
                      bank: firstPay.bank ?? fs.bank ?? '',
                      iban: firstPay.iban ?? fs.iban ?? '',
                      account_holder: firstPay.account_holder ?? fs.account_holder ?? '',
                      declarationAccepted: fs.declarationAccepted ? 'Da' : 'Nu',
                      signatoryName: fs.signatoryName ?? fs.signature ?? '',
                      signatureDate: fs.signatureDate ?? fs.date ?? '' ,
                      claim_number: fs.claim_number ?? fs.claimNumber ?? ''
                    }
                    return <ClaimTemplate data={previewData} />
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
