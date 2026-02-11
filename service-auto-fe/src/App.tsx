import './App.css'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import NewClient from './pages/NewClient'
import ClientProfile from './pages/ClientProfile'
import DriverLicenseNew from './pages/DriverLicenseNew'
import CarDocumentsNew from './pages/CarDocumentsNew'
import CompensationClaimNew from './pages/CompensationClaimNew'

function App() {
  return (
    <>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/clients/new" element={<NewClient />} />
        <Route path="/client/:id/driver-license/new" element={<DriverLicenseNew />} />
        <Route path="/client/:id/car-documents/new" element={<CarDocumentsNew />} />
        <Route path="/client/:id/compensation-claim/new" element={<CompensationClaimNew />} />
        <Route path="/clients/:id" element={<ClientProfile />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Routes>
    </>
  )
}

export default App