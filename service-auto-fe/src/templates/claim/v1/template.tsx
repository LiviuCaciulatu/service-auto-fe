import React from 'react'
import content from './content'
import './template.css'

type Props = {
  data?: Record<string, any>
}

function getVal(data: Record<string, any> | undefined, keys: string[] | string) {
  if (!data) return ''
  const ks = Array.isArray(keys) ? keys : [keys]
  for (const k of ks) {
    if (k in data && data[k] !== undefined && data[k] !== null) return data[k]
  }
  return ''
}

export default function ClaimTemplate({ data }: Props) {
  return (
    <div className="page-frame">
      <div className="claim-root">
        <div className="in-attentie"><strong>In atentia:</strong> {getVal(data, ['attention_to'])}</div>
      <div className="title">CERERE DE DESPĂGUBIRE</div>
      <div className="case-number">DOSARUL DE DAUNA NR: {getVal(data, ['claim_number','claim_file_number'])}</div>

      <div className="section">
        <div className="lead">
          Subsemnatul <strong>{getVal(data, ['claimant_name'])}</strong>, avand CNP <strong>{getVal(data, ['cnp'])}</strong>, in calitate de <strong>{getVal(data, ['role'])}</strong>, avand in vedere daunele autovehiculului marca <strong>{getVal(data, ['vehicle_make'])}</strong> tipul <strong>{getVal(data, ['vehicle_model'])}</strong> inmatriculat cu nr. <strong>{getVal(data, ['registration_number'])}</strong>, va rog sa imi aprobati plata despagubirii, dupa cum urmeaza:
        </div>

        <div className="payments">
          {(data?.compensated_clients ?? []).map((p: any, i: number) => (
            <div key={i} className="payment-row">
              Suma: <strong>{p?.amount ?? getVal(data, ['amount'])}</strong> lei in contul deschis la banca <strong>{p?.bank ?? getVal(data, ['bank'])}</strong>, conform: ____________________, IBAN: <strong>{p?.iban ?? getVal(data, ['iban'])}</strong>, titular cont <strong>{p?.account_holder ?? getVal(data, ['account_holder'])}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="observations">Pentru soltionarea dosarului de dauna anexez urmatoarele documente: <strong>{getVal(data, ['observations'])}</strong>;</div>

      <div className="legal">{content.legal.text}</div>

      <div className="signature">
        <div className="sig-row">
          <div className="date">Data: <strong>{getVal(data, ['date'])}</strong></div>
          <div className="sig-block">Semnatura/Stampila: <span className="sigline">{getVal(data, ['signature'])}</span></div>
        </div>
      </div>
    </div>
    </div>
  )
}
