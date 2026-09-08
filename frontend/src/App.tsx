import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import IntroPage from './pages/IntroPage'
import LandingPage from './pages/LandingPage'
import ProcessingPage from './pages/ProcessingPage'
import WizardPage from './pages/WizardPage'
import ErrorBoundary from './components/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

function WizardRedirect() {
  const { billId } = useParams<{ billId: string }>()
  return <Navigate to={billId ? `/wizard/${billId}` : '/'} replace />
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<IntroPage />} />
            <Route path="/upload" element={<LandingPage />} />
            <Route path="/processing/:billId" element={<ProcessingPage />} />
            <Route path="/wizard/:billId" element={<WizardPage />} />
            {/* Legacy route redirects -> seamlessly redirect to wizard with billId */}
            <Route path="/review/:billId" element={<WizardRedirect />} />
            <Route path="/people/:billId" element={<WizardRedirect />} />
            <Route path="/assign/:billId" element={<WizardRedirect />} />
            <Route path="/result/:billId" element={<WizardRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
