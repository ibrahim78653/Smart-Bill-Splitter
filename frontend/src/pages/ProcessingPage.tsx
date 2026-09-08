import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Receipt } from 'lucide-react'
import { extractBill, verifyBill, getBill } from '../lib/api'
import { useBillStore } from '../store/billStore'
import { cn } from '../lib/utils'
import wizardBg from '../assets/wizard-bg.png'

type StepStatus = 'done' | 'active' | 'pending'
type Step = { id: string; label: string; emoji: string; status: StepStatus }

const INITIAL_STEPS: Step[] = [
  { id: 'upload',     label: 'Bill uploaded',           emoji: '📤', status: 'done' },
  { id: 'preprocess', label: 'Enhancing image quality',  emoji: '🔍', status: 'active' },
  { id: 'extract',    label: 'Reading items and prices', emoji: '🤖', status: 'pending' },
  { id: 'verify',     label: 'Verifying numbers',        emoji: '🔢', status: 'pending' },
  { id: 'ready',      label: 'Preparing your review',   emoji: '✅', status: 'pending' },
]

const TIPS = [
  'Pro tip: You can add multiple photos for multi-page bills.',
  'AI reads tax lines separately — CGST, SGST, and all.',
  'Every calculation is deterministic — no AI guesswork.',
  'Fractional quantities are supported (e.g. 0.5 of a dish).',
  'Results are exact to the last paisa.',
]

export default function ProcessingPage() {
  const { billId } = useParams<{ billId: string }>()
  const navigate = useNavigate()
  const { setBill, setCurrentStep } = useBillStore()
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS)
  const [error, setError] = useState<string | null>(null)
  const [tipIndex, setTipIndex] = useState(0)

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

  // Rotate tips
  useEffect(() => {
    const t = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 3500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!billId) return

    const run = async () => {
      try {
        setTimeout(() => advance('extract'), 800)
        const bill = await extractBill(billId)
        setBill(bill)

        advance('verify')
        await verifyBill(billId)

        advance('ready')
        const updatedBill = await getBill(billId)
        setBill(updatedBill)

        setTimeout(() => {
          markAllDone()
          setCurrentStep(1)
          setTimeout(() => navigate(`/wizard/${billId}`), 600)
        }, 600)
      } catch (err: any) {
        setError(err.message)
      }
    }

    run()
  }, [billId])

  // Compute overall progress %
  const doneCount = steps.filter((s) => s.status === 'done').length
  const progressPct = Math.round((doneCount / steps.length) * 100)

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-cover bg-center bg-no-repeat bg-fixed"
      style={{
        backgroundImage: `url(${wizardBg})`,
        backgroundAttachment: 'fixed',
      }}
    >

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10 animate-fade-in cursor-pointer" onClick={() => navigate('/')}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-md">
          <Receipt className="text-white" size={19} />
        </div>
        <span className="font-bold text-xl text-ink-900 tracking-tight">Smart Bill Splitter</span>
      </div>

      <div className="w-full max-w-sm animate-slide-up">
        <div className="card p-8 border border-purple-100/80 shadow-card-elevated">
          {/* Spinner rings */}
          <div className="flex justify-center mb-8">
            <div className="relative w-20 h-20">
              {/* Outer ring */}
              {!error && (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-purple-100" />
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-purple-600 animate-ring-spin" />
                  <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-violet-400 animate-ring-spin-slow" />
                </>
              )}
              <div className={cn(
                'absolute inset-0 rounded-full flex items-center justify-center',
                error ? 'bg-danger-50' : 'bg-purple-50/50'
              )}>
                {error ? (
                  <span className="text-2xl">⚠️</span>
                ) : (
                  <Receipt className="text-purple-600" size={24} />
                )}
              </div>
            </div>
          </div>

          {error ? (
            <div className="text-center animate-bounce-in">
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
              <h2 className="font-bold text-xl text-ink-900 text-center mb-1">Reading your bill</h2>
              <p className="text-ink-400 text-sm text-center mb-6">This takes about 10–20 seconds</p>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-purple-50 rounded-full mb-6 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 via-violet-600 to-indigo-600 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Step list */}
              <ul className="space-y-3.5" role="list">
                {steps.map((step, idx) => (
                  <li
                    key={step.id}
                    className={cn(
                      'flex items-center gap-3 transition-all duration-300',
                      step.status === 'pending' ? 'opacity-40' : 'opacity-100'
                    )}
                    style={{ transitionDelay: `${idx * 50}ms` }}
                    aria-label={`${step.label}: ${step.status}`}
                  >
                    <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
                      {step.status === 'done' ? (
                        <CheckCircle2 className="text-purple-600 animate-check-pop" size={20} />
                      ) : step.status === 'active' ? (
                        <span className="text-base animate-pulse">{step.emoji}</span>
                      ) : (
                        <span className="text-base">{step.emoji}</span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-sm font-medium transition-colors duration-200',
                        step.status === 'done'   ? 'text-purple-700 font-semibold' :
                        step.status === 'active' ? 'text-violet-600 animate-pulse-soft font-semibold' :
                        'text-ink-300'
                      )}
                    >
                      {step.label}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Rotating tip */}
              <div className="mt-6 pt-5 border-t border-stone-100">
                <p key={tipIndex} className="text-xs text-ink-400 text-center animate-fade-in leading-relaxed">
                  💡 {TIPS[tipIndex]}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
