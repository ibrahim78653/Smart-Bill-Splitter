import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LandingPage from './pages/LandingPage'
import ProcessingPage from './pages/ProcessingPage'
import WizardPage from './pages/WizardPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/processing/:billId" element={<ProcessingPage />} />
          <Route path="/wizard/:billId" element={<WizardPage />} />
          {/* Legacy redirects — keep URLs working if someone has an old link */}
          <Route path="/review/:billId" element={<Navigate to="/" replace />} />
          <Route path="/people/:billId" element={<Navigate to="/" replace />} />
          <Route path="/assign/:billId" element={<Navigate to="/" replace />} />
          <Route path="/result/:billId" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
