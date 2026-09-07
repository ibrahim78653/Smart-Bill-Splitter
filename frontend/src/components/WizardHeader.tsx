/** WizardHeader — 4-step progress indicator for the wizard */
import { CheckCircle2, Receipt } from 'lucide-react'
import { cn } from '../lib/utils'
import { useBillStore } from '../store/billStore'

const STEPS = [
  { num: 1, label: 'Review' },
  { num: 2, label: 'People' },
  { num: 3, label: 'Assign' },
  { num: 4, label: 'Summary' },
] as const

interface WizardHeaderProps {
  /** Allow clicking a completed step dot to jump back */
  onStepClick?: (step: 1 | 2 | 3 | 4) => void
}

export default function WizardHeader({ onStepClick }: WizardHeaderProps) {
  const { currentStep } = useBillStore()

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-stone-100 shadow-sm">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shadow-sm">
            <Receipt className="text-white" size={14} />
          </div>
          <span className="font-bold text-sm text-ink-900 hidden sm:block">SplitSmart</span>
        </div>

        {/* Step track */}
        <div className="flex items-center flex-1" role="navigation" aria-label="Wizard steps">
          {STEPS.map((step, idx) => {
            const isDone = step.num < currentStep
            const isActive = step.num === currentStep
            const isClickable = isDone && !!onStepClick

            return (
              <div key={step.num} className="flex items-center flex-1 last:flex-none">
                {/* Dot + label */}
                <button
                  onClick={() => isClickable && onStepClick(step.num as 1 | 2 | 3 | 4)}
                  disabled={!isClickable}
                  className={cn(
                    'flex flex-col items-center gap-0.5 transition-all duration-200',
                    isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                  )}
                  aria-current={isActive ? 'step' : undefined}
                  aria-label={`Step ${step.num}: ${step.label}`}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300',
                      isDone
                        ? 'bg-emerald-600 text-white scale-90'
                        : isActive
                        ? 'bg-emerald-600 text-white scale-110 shadow-md ring-2 ring-emerald-200'
                        : 'bg-stone-100 text-ink-400'
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <span>{step.num}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[9px] font-semibold leading-none transition-colors duration-200 hidden sm:block',
                      isActive ? 'text-emerald-600' : isDone ? 'text-emerald-500' : 'text-ink-400'
                    )}
                  >
                    {step.label}
                  </span>
                </button>

                {/* Connector line */}
                {idx < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 mx-1.5 rounded-full overflow-hidden bg-stone-100">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        isDone ? 'bg-emerald-500 w-full' : 'w-0'
                      )}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </header>
  )
}
