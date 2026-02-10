import './App.css'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import NewClient from './pages/NewClient'
import ClientProfile from './pages/ClientProfile.tsx'

function App() {
  return (
    <>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/clients/new" element={<NewClient />} />
        <Route path="/clients/:id" element={<ClientProfile />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Routes>
    </>
  )
}

export default App