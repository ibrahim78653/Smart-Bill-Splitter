import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Loader2, Receipt } from 'lucide-react'
import { extractBill, verifyBill, getBill } from '../lib/api'
import { useBillStore } from '../store/billStore'

type Step = { id: string; label: string; status: 'done' | 'active' | 'pending' }

const INITIAL_STEPS: Step[] = [
  { id: 'upload', label: 'Uploaded your bill', status: 'done' },
  { id: 'preprocess', label: 'Enhancing image quality', status: 'active' },
  { id: 'extract', label: 'Reading items and prices', status: 'pending' },
  { id: 'verify', label: 'Checking numbers', status: 'pending' },
  { id: 'ready', label: 'Preparing your review', status: 'pending' },
]

export default function ProcessingPage() {
  const { billId } = useParams<{ billId: string }>()
  const navigate = useNavigate()
  const { setBill } = useBillStore()
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS)
  const [error, setError] = useState<string | null>(null)

  const advance = (activeId: string) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.status === 'active' ? { ...s, status: 'done' } :
        s.id === activeId ? { ...s, status: 'active' } : s
      )
    )
  }

  const markAllDone = () => {
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })))
  }

  useEffect(() => {
    if (!billId) return

    const run = async () => {
      try {
        // Advance to extract step
        setTimeout(() => advance('extract'), 800)
        const bill = await extractBill(billId)
        setBill(bill)

        // Advance to verify step
        advance('verify')
        await verifyBill(billId)

        // Advance to ready step
        advance('ready')
        const updatedBill = await getBill(billId)
        setBill(updatedBill)

        // Done — navigate to review
        setTimeout(() => {
          markAllDone()
          setTimeout(() => navigate(`/review/${billId}`), 600)
        }, 600)
      } catch (err: any) {
        setError(err.message)
      }
    }

    run()
  }, [billId])

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-12">
        <Receipt className="text-emerald-600" size={24} />
        <span className="font-bold text-xl text-ink-900">SplitSmart</span>
      </div>

      <div className="w-full max-w-sm">
        <div className="card p-8 animate-slide-up">
          {/* Spinner */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-emerald-100 flex items-center justify-center">
                <Receipt className="text-emerald-600" size={24} />
              </div>
              {!error && (
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-500 animate-spin" />
              )}
            </div>
          </div>

          {error ? (
            <div className="text-center">
              <p className="font-semibold text-ink-900 mb-2">Extraction failed</p>
              <p className="text-sm text-danger-600 mb-6">{error}</p>
              <button
                id="btn-try-again"
                onClick={() => navigate('/')}
                className="btn-secondary w-full"
              >
                Try another photo
              </button>
            </div>
          ) : (
            <>
              <h2 className="font-bold text-xl text-ink-900 text-center mb-2">
                Reading your bill
              </h2>
              <p className="text-ink-400 text-sm text-center mb-8">
                This takes about 10–20 seconds
              </p>

              {/* Step checklist */}
              <ul className="space-y-4" role="list">
                {steps.map((step) => (
                  <li
                    key={step.id}
                    className="flex items-center gap-3"
                    aria-label={`${step.label}: ${step.status}`}
                  >
                    {step.status === 'done' ? (
                      <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={20} />
                    ) : step.status === 'active' ? (
                      <Loader2 className="text-amber-500 flex-shrink-0 animate-spin" size={20} />
                    ) : (
                      <Circle className="text-stone-300 flex-shrink-0" size={20} />
                    )}
                    <span
                      className={
                        step.status === 'done'
                          ? 'text-emerald-700 font-medium text-sm'
                          : step.status === 'active'
                          ? 'text-amber-600 font-semibold text-sm animate-pulse-soft'
                          : 'text-ink-300 text-sm'
                      }
                    >
                      {step.label}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
