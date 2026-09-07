import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Calculator, ChevronDown, ChevronUp, MessageSquare, Users } from 'lucide-react'
import { saveAssignments, calculateBill, parseNLAssignment } from '../lib/api'
import { useBillStore } from '../store/billStore'
import type { Assignment, PersonAllocation, LineItem } from '../store/billStore'
import { formatCurrency, cn } from '../lib/utils'

const PERSON_COLORS = [
  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', active: 'bg-emerald-600 text-white border-emerald-600' },
  { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-300', active: 'bg-sky-500 text-white border-sky-500' },
  { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-300', active: 'bg-violet-600 text-white border-violet-600' },
  { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300', active: 'bg-rose-500 text-white border-rose-500' },
  { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300', active: 'bg-orange-500 text-white border-orange-500' },
  { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-300', active: 'bg-teal-600 text-white border-teal-600' },
  { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-300', active: 'bg-pink-500 text-white border-pink-500' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-300', active: 'bg-indigo-600 text-white border-indigo-600' },
  { bg: 'bg-lime-100', text: 'text-lime-700', border: 'border-lime-300', active: 'bg-lime-600 text-white border-lime-600' },
  { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', active: 'bg-amber-500 text-white border-amber-500' },
]

export default function AssignmentPage() {
  const { billId } = useParams<{ billId: string }>()
  const navigate = useNavigate()
  const { bill, people, assignments, setAssignments, updateAssignment } = useBillStore()

  const [saving, setSaving] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nlInstruction, setNlInstruction] = useState('')
  const [nlLoading, setNlLoading] = useState(false)
  const [showNl, setShowNl] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  // Initialize empty assignments
  useEffect(() => {
    if (bill && people.length > 0 && assignments.length === 0) {
      const empty: Assignment[] = bill.line_items.map((item) => ({
        line_item_id: item.id,
        allocations: [],
      }))
      setAssignments(empty)
    }
  }, [bill, people])

  const getAllocForItem = (itemId: string): PersonAllocation[] =>
    assignments.find((a) => a.line_item_id === itemId)?.allocations || []

  const getAllocTotal = (itemId: string): number => {
    const allocs = getAllocForItem(itemId)
    return allocs.reduce((sum, a) => sum + parseFloat(a.quantity), 0)
  }

  const getRemaining = (item: LineItem): number => {
    const total = parseFloat(item.quantity)
    const allocated = getAllocTotal(item.id)
    return Math.round((total - allocated) * 100) / 100
  }

  // Toggle person for an item (simple equal-split toggle)
  const togglePerson = (itemId: string, personId: string, itemQty: string) => {
    const allocs = getAllocForItem(itemId)
    const isAssigned = allocs.some((a) => a.person_id === personId)

    let newAllocs: PersonAllocation[]
    if (isAssigned) {
      newAllocs = allocs.filter((a) => a.person_id !== personId)
    } else {
      newAllocs = [...allocs, { person_id: personId, quantity: '0' }]
    }
    // Re-distribute quantity equally
    if (newAllocs.length > 0) {
      const equalShare = (parseFloat(itemQty) / newAllocs.length).toFixed(4)
      newAllocs = newAllocs.map((a) => ({ ...a, quantity: equalShare }))
      // Fix rounding on last person
      const currentSum = newAllocs.reduce((s, a) => s + parseFloat(a.quantity), 0)
      const diff = parseFloat(itemQty) - currentSum
      if (Math.abs(diff) > 0.0001) {
        newAllocs[newAllocs.length - 1].quantity = (
          parseFloat(newAllocs[newAllocs.length - 1].quantity) + diff
        ).toFixed(4)
      }
    }
    updateAssignment(itemId, newAllocs)
  }

  // Assign to everyone
  const assignEveryone = (item: LineItem) => {
    const equalShare = (parseFloat(item.quantity) / people.length).toFixed(4)
    const allocs: PersonAllocation[] = people.map((p, i) => ({
      person_id: p.id,
      quantity: i === people.length - 1
        ? (parseFloat(item.quantity) - (parseFloat(equalShare) * (people.length - 1))).toFixed(4)
        : equalShare,
    }))
    updateAssignment(item.id, allocs)
  }

  // NL assist
  const handleNlParse = async () => {
    if (!billId || !nlInstruction.trim()) return
    setNlLoading(true)
    try {
      const result = await parseNLAssignment(billId, nlInstruction)
      // Apply proposal to assignments
      result.proposal.forEach((p: any) => {
        const allocs: PersonAllocation[] = p.allocations.map((a: any) => ({
          person_id: a.person_id,
          quantity: a.quantity,
        }))
        updateAssignment(p.line_item_id, allocs)
      })
      setNlInstruction('')
      setShowNl(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setNlLoading(false)
    }
  }

  const allAssigned = bill?.line_items.every((item) => {
    const remaining = getRemaining(item)
    return Math.abs(remaining) < 0.01
  })

  const handleCalculate = async () => {
    if (!billId) return
    setSaving(true)
    setError(null)
    try {
      await saveAssignments(billId, assignments)
      setCalculating(true)
      await calculateBill(billId)
      navigate(`/result/${billId}`)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
      setCalculating(false)
    }
  }

  if (!bill || !people.length) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-ink-500">Loading...</p></div>
  }

  return (
    <div className="min-h-screen bg-surface-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-stone-100 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              id="btn-back-to-people"
              onClick={() => navigate(`/people/${billId}`)}
              className="btn-ghost px-2 py-2"
              aria-label="Back"
            >←</button>
            <div>
              <div className="flex items-center gap-2">
                <Users className="text-emerald-600" size={18} />
                <span className="font-bold text-ink-900">Assign Items</span>
              </div>
              <p className="text-xs text-ink-400">Tap names to assign • Long-press to split</p>
            </div>
          </div>
          {/* Progress */}
          <div className="text-right">
            <p className="text-xs text-ink-400 font-medium">
              {bill.line_items.filter((i) => Math.abs(getRemaining(i)) < 0.01).length}/
              {bill.line_items.length} done
            </p>
            <div className="w-20 h-1.5 bg-stone-100 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{
                  width: `${(bill.line_items.filter((i) => Math.abs(getRemaining(i)) < 0.01).length / bill.line_items.length) * 100}%`
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
        {/* NL Assist */}
        <div className="card overflow-hidden">
          <button
            id="btn-toggle-nl"
            onClick={() => setShowNl((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-stone-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="text-emerald-600" size={18} />
              <span className="font-semibold text-sm text-ink-900">Smart assignment</span>
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">AI Assist</span>
            </div>
            {showNl ? <ChevronUp size={16} className="text-ink-400" /> : <ChevronDown size={16} className="text-ink-400" />}
          </button>
          {showNl && (
            <div className="px-5 pb-4 space-y-3 border-t border-stone-50">
              <p className="text-xs text-ink-400 mt-3">
                Describe who had what in plain English. This creates a <strong>proposal</strong> — you'll still review it.
              </p>
              <textarea
                id="nl-instruction-input"
                value={nlInstruction}
                onChange={(e) => setNlInstruction(e.target.value)}
                placeholder="e.g. 2 biryanis shared by Ibrahim and Yusuf, Coke was Ahmed's, everything else split by everyone"
                className="input-field text-sm min-h-[80px] resize-none"
              />
              <button
                id="btn-apply-nl"
                onClick={handleNlParse}
                disabled={nlLoading || !nlInstruction.trim()}
                className="btn-primary w-full py-2.5 text-sm"
              >
                {nlLoading ? 'Parsing...' : 'Apply suggestion →'}
              </button>
            </div>
          )}
        </div>

        {/* Line items */}
        {bill.line_items.map((item) => {
          const remaining = getRemaining(item)
          const isComplete = Math.abs(remaining) < 0.01
          const allocs = getAllocForItem(item.id)
          const isExpanded = expandedItems.has(item.id)

          return (
            <div
              key={item.id}
              className={cn(
                'card overflow-hidden transition-all',
                isComplete ? 'border-emerald-100' : ''
              )}
            >
              {/* Item header */}
              <div className="px-5 py-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isComplete && (
                        <span className="text-emerald-500" aria-label="Fully assigned">✓</span>
                      )}
                      <p className="font-semibold text-ink-900 text-sm">{item.name}</p>
                    </div>
                    <p className="text-xs text-ink-400 mt-0.5">
                      Qty: {item.quantity} ·{' '}
                      {formatCurrency(item.line_total, bill.currency)}
                    </p>
                  </div>
                  {/* Remaining indicator */}
                  <div className={cn(
                    'flex-shrink-0 ml-3 px-2.5 py-1 rounded-lg text-xs font-semibold',
                    isComplete
                      ? 'bg-emerald-100 text-emerald-700'
                      : remaining > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-danger-100 text-danger-600'
                  )}>
                    {isComplete ? '✓ Done' : `${remaining > 0 ? remaining : 'Over'}`}
                  </div>
                </div>

                {/* Person chips */}
                <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Assign to people">
                  {people.map((person, idx) => {
                    const isActive = allocs.some((a) => a.person_id === person.id)
                    const color = PERSON_COLORS[idx % PERSON_COLORS.length]
                    return (
                      <button
                        key={person.id}
                        id={`btn-assign-${item.id}-${person.id}`}
                        onClick={() => togglePerson(item.id, person.id, item.quantity)}
                        className={cn(
                          'chip text-xs font-semibold border transition-all',
                          isActive ? color.active : `${color.bg} ${color.text} ${color.border} hover:opacity-80`
                        )}
                        aria-pressed={isActive}
                        aria-label={`Assign to ${person.name}`}
                      >
                        {person.name}
                      </button>
                    )
                  })}
                  <button
                    id={`btn-assign-all-${item.id}`}
                    onClick={() => assignEveryone(item)}
                    className="chip chip-unselected text-xs"
                  >
                    Everyone
                  </button>
                </div>

                {/* Fractional qty toggle */}
                {parseFloat(item.quantity) > 1 && allocs.length > 0 && (
                  <button
                    id={`btn-toggle-fractions-${item.id}`}
                    onClick={() => setExpandedItems((prev) => {
                      const next = new Set(prev)
                      next.has(item.id) ? next.delete(item.id) : next.add(item.id)
                      return next
                    })}
                    className="text-xs text-emerald-600 font-medium mt-1 hover:underline"
                  >
                    {isExpanded ? '▲ Hide fractions' : '▼ Adjust quantities'}
                  </button>
                )}

                {/* Fractional quantity inputs */}
                {isExpanded && (
                  <div className="mt-3 space-y-2 pt-3 border-t border-stone-50">
                    <p className="text-xs text-ink-400 font-medium">Exact quantities (must sum to {item.quantity})</p>
                    {allocs.map((alloc) => {
                      const person = people.find((p) => p.id === alloc.person_id)
                      return (
                        <div key={alloc.person_id} className="flex items-center gap-3">
                          <span className="text-sm text-ink-700 w-24 truncate">{person?.name}</span>
                          <input
                            id={`input-qty-${item.id}-${alloc.person_id}`}
                            type="number"
                            step="0.5"
                            min="0"
                            max={item.quantity}
                            value={alloc.quantity}
                            onChange={(e) => {
                              const newAllocs = allocs.map((a) =>
                                a.person_id === alloc.person_id
                                  ? { ...a, quantity: e.target.value }
                                  : a
                              )
                              updateAssignment(item.id, newAllocs)
                            }}
                            className="input-field py-1.5 text-sm w-24"
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {error && (
          <div className="px-4 py-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-600 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Sticky bottom */}
      <div className="sticky-bottom">
        <div className="flex-1">
          {!allAssigned && (
            <p className="text-xs text-amber-600 font-medium mb-2 text-center">
              ⚠ Some items still need to be assigned
            </p>
          )}
          <button
            id="btn-calculate"
            onClick={handleCalculate}
            disabled={saving || calculating || !allAssigned}
            className="btn-primary w-full py-4 flex items-center justify-center gap-2 text-base"
          >
            <Calculator size={18} />
            {calculating ? 'Calculating...' : saving ? 'Saving...' : 'Calculate Shares →'}
          </button>
        </div>
      </div>
    </div>
  )
}
