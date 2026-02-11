function safeString(v: any) {
  if (v === null || v === undefined) return ''
  return String(v)
}

export function formatDateISOtoLocal(d?: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  const day = String(dt.getDate()).padStart(2, '0')
  const month = String(dt.getMonth() + 1).padStart(2, '0')
  const year = String(dt.getFullYear())
  return `${day}.${month}.${year}`
}

export function formatCurrencyRON(amount?: number | string | null) {
  if (amount === null || amount === undefined || amount === '') return ''
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(/[^0-9.-]+/g, ''))
  if (Number.isNaN(n)) return ''
  return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(n)
}

export function formatPhone(raw?: string | null) {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length <= 3) return digits

  return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

export function maskCNP(cnp?: string | null) {
  if (!cnp) return ''
  const s = String(cnp)
  const show = Math.min(3, Math.max(2, s.length >= 3 ? 3 : 2))
  return s.slice(0, show) + '***'
}

export function maskPolicyNumber(p?: string | null) {
  if (!p) return ''
  const s = String(p)
  if (s.length <= 6) return s.replace(/.(?=.{2})/g, '*')

  return s.slice(0, 2) + s.slice(2, -2).replace(/./g, '*') + s.slice(-2)
}

export function combineName(raw: any) {
  const first = raw?.first_name ?? raw?.firstName ?? ''
  const last = raw?.last_name ?? raw?.lastName ?? ''
  const full = `${first ?? ''}${first && last ? ' ' : ''}${last ?? ''}`.trim()
  return full || (raw?.name ? String(raw.name) : '')
}

export function combineAddress(raw: any) {
  if (!raw) return ''
  const parts = [raw.street, raw.address, raw.city, raw.county, raw.postal_code, raw.country]
    .filter(Boolean)
  return parts.join(', ')
}

export function boolToDaNu(v: any) {
  if (v === undefined || v === null) return ''
  return v ? 'Da' : 'Nu'
}

export function mapEnum(value: any, map: Record<string, string> = {}) {
  if (value === undefined || value === null) return ''
  const key = String(value)
  return map[key] ?? key
}


export function mapClaim(raw: any = {}) {
  const out: Record<string, any> = {}

  out['Nume complet'] = combineName(raw)
  out['CNP'] = maskCNP(raw.cnp ?? raw.CNP ?? raw.cnp_raw)
  out['Telefon'] = formatPhone(raw.phone ?? raw.telefon)
  out['Email'] = safeString(raw.email ?? raw.mail ?? '')
  out['Număr poliță'] = maskPolicyNumber(raw.policy_number ?? raw.policyNumber ?? raw.numar_polita)
  out['Număr de înmatriculare'] = safeString(raw.registration_number ?? raw.reg_nr ?? raw.nr_inmatriculare)
  out['Marcă / Model'] = safeString(raw.make_model ?? raw.brand_model ?? raw.brand)
  out['Serie șasiu'] = safeString(raw.vin ?? raw.chassis ?? raw.serie_shasiu)

  out['Data accidentului'] = formatDateISOtoLocal(raw.accident_date ?? raw.date)
  out['Locul accidentului'] = safeString(raw.accident_place ?? raw.location)
  out['Vinovat'] = mapEnum(raw.guilty ?? raw.vinovat)
  out['Număr dosar daună'] = safeString(raw.claim_number ?? raw.dosar)
  out['Descrierea evenimentului'] = safeString(raw.event_description ?? raw.descriere)

  out['Observații'] = safeString(raw.observatii ?? raw.notes ?? '')
  out['Număr certificat'] = safeString(raw.numar_certificat ?? raw.certificate_number ?? '')

  // example boolean fields
  out['C2 equals C1'] = boolToDaNu(raw.property_C_2_equals_C_1 ?? raw.C2_eq_C1)
  out['C3 equals C1'] = boolToDaNu(raw.property_C_3_equals_C_1 ?? raw.C3_eq_C1)

  // metadata
  out['Pagina'] = ''
  out['Data generării'] = formatDateISOtoLocal(new Date().toISOString())

  return out
}

export default mapClaim
