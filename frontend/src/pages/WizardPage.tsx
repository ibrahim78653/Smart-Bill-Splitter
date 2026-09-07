/**
 * WizardPage — 4-step wizard shell.
 * Renders WizardHeader + the active step component.
 * Manages step transitions with slide animations.
 * All state is kept in the Zustand store so back-nav never loses data.
 */
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBillStore } from '../store/billStore'
import WizardHeader from '../components/WizardHeader'
import Step1Review from './wizard/Step1Review'
import Step2People from './wizard/Step2People'
import Step3Assign from './wizard/Step3Assign'
import Step4Summary from './wizard/Step4Summary'
import { getBill } from '../lib/api'
import { cn } from '../lib/utils'

export default function WizardPage() {
  const { billId } = useParams<{ billId: string }>()
  const navigate = useNavigate()
  const { bill, setBill, currentStep, setCurrentStep, reset } = useBillStore()

  // Direction tracking for slide animation (1 = forward, -1 = backward)
  const prevStep = useRef<number>(currentStep)
  const direction = currentStep > prevStep.current ? 1 : -1

  // Load bill from API on mount if not already in store
  useEffect(() => {
    if (!billId) { navigate('/'); return }
    if (!bill) {
      getBill(billId)
        .then((data) => setBill(data))
        .catch(() => navigate('/'))
    }
  }, [billId])

  if (!billId) return null

  const goTo = (step: 1 | 2 | 3 | 4) => {
    prevStep.current = currentStep
    setCurrentStep(step)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleReset = () => {
    reset()
    navigate('/')
  }

  /* ── Animation key changes per step ──────────────────────────────────── */
  const slideClass = direction >= 0
    ? 'animate-slide-from-right'
    : 'animate-slide-from-left'

  return (
    <div className="min-h-screen bg-surface-50">
      <WizardHeader
        onStepClick={(step) => {
          if (step < currentStep) goTo(step)
        }}
      />

      {/* Step content with slide animation */}
      <div key={currentStep} className={cn('page-enter', slideClass)}>
        {currentStep === 1 && (
          <Step1Review
            billId={billId}
            onNext={() => goTo(2)}
          />
        )}
        {currentStep === 2 && (
          <Step2People
            billId={billId}
            onNext={() => goTo(3)}
            onBack={() => goTo(1)}
          />
        )}
        {currentStep === 3 && (
          <Step3Assign
            billId={billId}
            onNext={() => goTo(4)}
            onBack={() => goTo(2)}
          />
        )}
        {currentStep === 4 && (
          <Step4Summary
            billId={billId}
            onBack={() => goTo(3)}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
