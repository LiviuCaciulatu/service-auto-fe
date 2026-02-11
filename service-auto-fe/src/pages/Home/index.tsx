import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Home.css'

type Client = {
  id: number | string
  name?: string
  [key: string]: any
}

export default function Home() {
  const [clients, setClients] = useState<Client[] | null>(null)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchClients = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/clients')
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const data = await res.json()
      setClients(data)
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error')
      setClients(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClients()
  }, [])

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

  return (
    <main className="home-container">
      <h1 className="home-header">Clients</h1>

      <div className="home-controls">
        <button className="btn" onClick={fetchClients} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
        <button className="btn new-client" onClick={() => navigate('/clients/new')}>New Client</button>
      </div>

      {error && <div className="error">Error: {error}</div>}

      {!error && loading && <div>Loading clients...</div>}

      {!error && clients && clients.length === 0 && <div>No clients found.</div>}

      {!error && clients && clients.length > 0 && (
        <div className="home-grid">
          {clients.map(c => (
            <div key={c.id} className="home-card">
                <div className="card-row">
                  <div className="client-name">{getDisplayName(c)}</div>
                  <div className="card-actions">
                    <button className="btn" onClick={() => navigate(`/clients/${c.id}`)}>View profile</button>
                  </div>
                </div>
            </div>
          ))}
        </div>
      )}

    </main>
  )
}
