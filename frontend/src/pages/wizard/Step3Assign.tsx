/**
 * Step3Assign — Assign each line item to one or more people.
 * Uses toggle chips per person + "All" quick-select.
 * Blocks Next if any item has 0 assignees.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Calculator, CheckCircle2, Loader2 } from 'lucide-react'
import { saveAssignments, calculateBill } from '../../lib/api'
import { useBillStore } from '../../store/billStore'
import type { Assignment, PersonAllocation } from '../../store/billStore'
import { formatCurrency, cn } from '../../lib/utils'

const PERSON_COLORS = [
  { active: 'bg-emerald-600 text-white border-emerald-600', passive: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100', dot: 'bg-emerald-500' },
  { active: 'bg-sky-500 text-white border-sky-500',         passive: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',         dot: 'bg-sky-500' },
  { active: 'bg-violet-600 text-white border-violet-600',   passive: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100', dot: 'bg-violet-500' },
  { active: 'bg-rose-500 text-white border-rose-500',       passive: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',       dot: 'bg-rose-500' },
  { active: 'bg-orange-500 text-white border-orange-500',   passive: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100', dot: 'bg-orange-500' },
  { active: 'bg-teal-600 text-white border-teal-600',       passive: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100',       dot: 'bg-teal-500' },
  { active: 'bg-pink-500 text-white border-pink-500',       passive: 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100',       dot: 'bg-pink-500' },
  { active: 'bg-indigo-600 text-white border-indigo-600',   passive: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100', dot: 'bg-indigo-500' },
  { active: 'bg-lime-600 text-white border-lime-600',       passive: 'bg-lime-50 text-lime-700 border-lime-200 hover:bg-lime-100',       dot: 'bg-lime-500' },
  { active: 'bg-amber-500 text-white border-amber-500',     passive: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',   dot: 'bg-amber-500' },
]

interface Props {
  billId: string
  onNext: () => void
  onBack: () => void
}

export default function Step3Assign({ billId, onNext, onBack }: Props) {
  const { bill, people, wizardAssignments, setWizardAssignments, setItemAssignees, setAssignments } = useBillStore()

  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // Init empty assignments for items not yet touched
  useEffect(() => {
    if (!bill) return
    const init: Record<string, string[]> = { ...wizardAssignments }
    bill.line_items.forEach((item) => {
      if (!init[item.id]) init[item.id] = []
    })
    setWizardAssignments(init)
  }, [bill?.bill_id])

  if (!bill || !people.length) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="animate-spin text-emerald-500" size={28} />
      </div>
    )
  }

  const togglePerson = (itemId: string, personId: string) => {
    const current = wizardAssignments[itemId] ?? []
    const next = current.includes(personId)
      ? current.filter((id) => id !== personId)
      : [...current, personId]
    setItemAssignees(itemId, next)
    // Clear inline error for this item
    if (next.length > 0) setErrors((e) => ({ ...e, [itemId]: false }))
  }

  const assignAll = (itemId: string) => {
    setItemAssignees(itemId, people.map((p) => p.id))
    setErrors((e) => ({ ...e, [itemId]: false }))
  }

  const clearAll = (itemId: string) => {
    setItemAssignees(itemId, [])
  }

  const doneCount = bill.line_items.filter(
    (i) => (wizardAssignments[i.id]?.length ?? 0) > 0
  ).length
  const totalCount = bill.line_items.length
  const allAssigned = doneCount === totalCount && totalCount > 0
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const handleNext = async () => {
    // Validate: every item must have ≥1 person
    const newErrors: Record<string, boolean> = {}
    let hasError = false
    bill.line_items.forEach((item) => {
      if ((wizardAssignments[item.id]?.length ?? 0) === 0) {
        newErrors[item.id] = true
        hasError = true
      }
    })
    setErrors(newErrors)
    if (hasError) return

    setSaving(true)
    setApiError(null)
    try {
      // Convert wizard assignments to API format (equal-split quantities)
      const apiAssignments: Assignment[] = bill.line_items.map((item) => {
        const assignees = wizardAssignments[item.id] ?? []
        const qty = parseFloat(item.quantity)
        const share = qty / assignees.length
        const allocations: PersonAllocation[] = assignees.map((pid, i) => ({
          person_id: pid,
          quantity: i === assignees.length - 1
            ? (qty - share * (assignees.length - 1)).toFixed(4)
            : share.toFixed(4),
        }))
        return { line_item_id: item.id, allocations }
      })

      setAssignments(apiAssignments)
      await saveAssignments(billId, apiAssignments)
      await calculateBill(billId)
      onNext()
    } catch (err: any) {
      setApiError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32 space-y-4">
      {/* Progress header */}
      <div className="card p-4 flex items-center gap-4 animate-slide-up">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm font-semibold text-ink-700">
              {allAssigned ? '🎉 All items assigned!' : `${doneCount} of ${totalCount} items assigned`}
            </p>
            <span className="text-xs font-bold text-ink-500 tabular-nums">{progressPct}%</span>
          </div>
          <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500 ease-out',
                allAssigned ? 'bg-emerald-500' : 'bg-amber-400'
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        {allAssigned && (
          <CheckCircle2 className="text-emerald-500 flex-shrink-0 animate-check-pop" size={22} />
        )}
      </div>

      {/* Item cards */}
      {bill.line_items.map((item, itemIdx) => {
        const assignees = wizardAssignments[item.id] ?? []
        const isComplete = assignees.length > 0
        const hasError = errors[item.id]

        return (
          <div
            key={item.id}
            className={cn(
              'card overflow-hidden transition-all duration-300 animate-slide-up',
              isComplete ? 'border-emerald-200' : hasError ? 'border-danger-300 bg-danger-50/20' : 'border-stone-100'
            )}
            style={{ animationDelay: `${itemIdx * 40}ms` }}
          >
            <div className="px-5 py-4">
              {/* Item header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isComplete && (
                      <CheckCircle2 className="text-emerald-500 flex-shrink-0" size={15} />
                    )}
                    {hasError && (
                      <AlertTriangle className="text-danger-500 flex-shrink-0" size={15} />
                    )}
                    <p className="font-semibold text-ink-900 text-sm truncate">{item.name}</p>
                  </div>
                  <p className="text-xs text-ink-400 mt-0.5 ml-0">
                    Qty {item.quantity} ·{' '}
                    <span className="font-medium text-ink-700">
                      {formatCurrency(item.line_total, bill.currency)}
                    </span>
                  </p>
                </div>
                <div
                  className={cn(
                    'flex-shrink-0 ml-3 px-2.5 py-1 rounded-lg text-xs font-bold transition-all duration-300',
                    isComplete
                      ? 'bg-emerald-100 text-emerald-700'
                      : hasError
                      ? 'bg-danger-100 text-danger-600'
                      : 'bg-stone-100 text-ink-400'
                  )}
                >
                  {isComplete
                    ? `${assignees.length} person${assignees.length !== 1 ? 's' : ''}`
                    : hasError
                    ? '⚠ Assign someone'
                    : 'Unassigned'}
                </div>
              </div>

              {/* Person chips */}
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Assign ${item.name}`}>
                {people.map((person, pIdx) => {
                  const isActive = assignees.includes(person.id)
                  const c = PERSON_COLORS[pIdx % PERSON_COLORS.length]
                  return (
                    <button
                      key={person.id}
                      id={`btn-assign-${item.id}-${person.id}`}
                      onClick={() => togglePerson(item.id, person.id)}
                      className={cn(
                        'chip text-xs font-semibold border transition-all duration-150',
                        isActive ? `${c.active} scale-100 shadow-sm` : `${c.passive} active:scale-95`
                      )}
                      aria-pressed={isActive}
                      aria-label={`${isActive ? 'Remove' : 'Assign'} ${person.name}`}
                    >
                      {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white/70 mr-1" />}
                      {person.name}
                    </button>
                  )
                })}

                {/* All / Clear shortcuts */}
                {assignees.length === people.length ? (
                  <button
                    id={`btn-clear-all-${item.id}`}
                    onClick={() => clearAll(item.id)}
                    className="chip chip-unselected text-xs"
                  >
                    Clear all
                  </button>
                ) : (
                  <button
                    id={`btn-assign-all-${item.id}`}
                    onClick={() => assignAll(item.id)}
                    className="chip chip-unselected text-xs"
                  >
                    All
                  </button>
                )}
              </div>

              {/* Per-person share preview */}
              {isComplete && item.line_total && (
                <p className="text-[11px] text-ink-400 mt-2.5">
                  ≈ {formatCurrency(
                    (parseFloat(item.line_total) / assignees.length).toFixed(2),
                    bill.currency
                  )}{' '}
                  each
                </p>
              )}
            </div>
          </div>
        )
      })}

      {apiError && (
        <div className="px-4 py-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-600 text-sm animate-bounce-in">
          {apiError}
        </div>
      )}

      {/* Sticky bottom */}
      <div className="sticky-bottom">
        <div className="flex-1">
          {!allAssigned && (
            <p className="text-xs text-amber-600 font-medium mb-2 text-center">
              ⚠ {totalCount - doneCount} item{totalCount - doneCount !== 1 ? 's' : ''} still need assigning
            </p>
          )}
          <div className="flex gap-3">
            <button
              id="btn-step3-back"
              onClick={onBack}
              className="btn-secondary px-5 py-4 flex items-center gap-2"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              id="btn-step3-next"
              onClick={handleNext}
              disabled={saving}
              className="btn-primary flex-1 py-4 flex items-center justify-center gap-2 text-base"
            >
              {saving ? (
                <><Loader2 size={18} className="animate-spin" /> Calculating…</>
              ) : (
                <><Calculator size={18} /> Calculate Shares →</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
