import './App.css'
import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import NewClient from './pages/NewClient'
import ClientProfile from './pages/ClientProfile'
import DriverLicenseNew from './pages/DriverLicenseNew'
import CarDocumentsNew from './pages/CarDocumentsNew'
import CompensationClaimNew from './pages/CompensationClaimNew'
import DriverLicenseView from './pages/DriverLicenseView'
import CarDocumentView from './pages/CarDocumentView'
import CompensationClaimView from './pages/CompensationClaimView'

function App() {
  return (
    <>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="/clients/new" element={<NewClient />} />
        <Route path="/clients/:id/driver-license/new" element={<DriverLicenseNew />} />
        <Route path="/clients/:id/car-documents/new" element={<CarDocumentsNew />} />
        <Route path="/clients/:id/compensation-claim/new" element={<CompensationClaimNew />} />
        <Route path="/clients/:id/driver-license/:docId" element={<DriverLicenseView />} />
        <Route path="/clients/:id/car-documents/:docId" element={<CarDocumentView />} />
        <Route path="/clients/:id/compensation-claims/:claimId" element={<CompensationClaimView />} />
        <Route path="/clients/:id" element={<ClientProfile />} />
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Routes>
    </>
  )
}

export default App