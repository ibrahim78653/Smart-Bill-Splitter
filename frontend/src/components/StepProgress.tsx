/** StepProgress — sticky top breadcrumb navigation showing workflow progress */
import { useLocation } from 'react-router-dom'
import { CheckCircle2, Receipt } from 'lucide-react'
import { cn } from '../lib/utils'

const STEPS = [
  { id: 'review',  label: 'Review',  path: '/review/' },
  { id: 'people',  label: 'People',  path: '/people/' },
  { id: 'assign',  label: 'Assign',  path: '/assign/' },
  { id: 'result',  label: 'Result',  path: '/result/' },
]

export default function StepProgress() {
  const { pathname } = useLocation()

  const currentIndex = STEPS.findIndex((s) => pathname.startsWith(s.path))

  return (
    <div className="flex items-center gap-1 py-2 px-1" role="navigation" aria-label="Progress">
      {STEPS.map((step, idx) => {
        const isDone    = idx < currentIndex
        const isActive  = idx === currentIndex
        const isPending = idx > currentIndex

        return (
          <div key={step.id} className="flex items-center gap-1 flex-1 last:flex-none">
            {/* Dot + label */}
            <div className="flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300',
                  isDone
                    ? 'bg-emerald-600 text-white scale-90'
                    : isActive
                    ? 'bg-emerald-600 text-white scale-100 shadow-glow-emerald ring-2 ring-emerald-200'
                    : 'bg-stone-100 text-ink-400'
                )}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? (
                  <CheckCircle2 size={14} className="animate-check-pop" />
                ) : (
                  <span>{idx + 1}</span>
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
            </div>

            {/* Connector line */}
            {idx < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-1 rounded-full overflow-hidden bg-stone-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isDone ? 'bg-emerald-500 w-full' : 'bg-transparent w-0'
                  )}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
