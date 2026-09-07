import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LandingPage from './pages/LandingPage'
import ProcessingPage from './pages/ProcessingPage'
import ReviewPage from './pages/ReviewPage'
import PeoplePage from './pages/PeoplePage'
import AssignmentPage from './pages/AssignmentPage'
import ResultPage from './pages/ResultPage'

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
          <Route path="/review/:billId" element={<ReviewPage />} />
          <Route path="/people/:billId" element={<PeoplePage />} />
          <Route path="/assign/:billId" element={<AssignmentPage />} />
          <Route path="/result/:billId" element={<ResultPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
