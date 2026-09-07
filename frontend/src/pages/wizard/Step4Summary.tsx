/**
 * Step4Summary — Final split result.
 * Fetches backend-computed result, displays per-person amounts with animated count-up.
 * Shows grand total sanity check + expandable per-person breakdown.
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, ChevronDown, Copy, Receipt, Share2, Sparkles } from 'lucide-react'
import { getResult } from '../../lib/api'
import { formatCurrency, cn } from '../../lib/utils'

const PERSON_COLORS = [
  'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-rose-500',
  'bg-orange-500', 'bg-teal-500', 'bg-pink-500', 'bg-indigo-500',
  'bg-lime-500', 'bg-amber-500',
]

const RING_COLORS = [
  'ring-emerald-200', 'ring-sky-200', 'ring-violet-200', 'ring-rose-200',
  'ring-orange-200', 'ring-teal-200', 'ring-pink-200', 'ring-indigo-200',
  'ring-lime-200', 'ring-amber-200',
]

interface PersonResult {
  person_id: string
  name: string
  line_breakdown: Array<{
    item_name: string
    allocated_quantity: string
    line_total_share: string
    provenance: string
  }>
  food_subtotal: string
  tax_breakdown: Array<[string, string]>
  service_charge_share: string
  discount_share: string
  rounding_adjustment: string
  total: string
}

interface BillResult {
  bill_id: string
  people: PersonResult[]
  items_subtotal: string
  discount_total: string
  service_charge_total: string
  tax_totals: Array<[string, string]>
  final_bill_total: string
  people_total: string
  reconciled: boolean
  rounding_log: string[]
}

/** Animated count-up from 0 → target */
function AnimatedAmount({ value, currency = 'INR' }: { value: string; currency?: string }) {
  const [display, setDisplay] = useState('—')
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const DURATION = 900

  useEffect(() => {
    const target = parseFloat(value) || 0
    startRef.current = null
    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts
      const elapsed = ts - startRef.current
      const progress = Math.min(elapsed / DURATION, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(formatCurrency((eased * target).toFixed(2), currency))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        setDisplay(formatCurrency(value, currency))
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, currency])

  return <span className="tabular-nums">{display}</span>
}

function ConfettiBurst() {
  return (
    <div className="flex justify-center gap-2 mb-4 pointer-events-none select-none">
      {['🎉', '✨', '🎊', '💫', '⭐', '🎈'].map((c, i) => (
        <span key={i} className="text-2xl animate-confetti-drop" style={{ animationDelay: `${i * 80}ms` }}>
          {c}
        </span>
      ))}
    </div>
  )
}

interface Props {
  billId: string
  onBack: () => void
  onReset: () => void
}

export default function Step4Summary({ billId, onBack, onReset }: Props) {
  const [result, setResult] = useState<BillResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPeople, setExpandedPeople] = useState<Set<string>>(new Set())
  const [showReconciliation, setShowReconciliation] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getResult(billId)
      .then((data) => { setResult(data); setLoading(false) })
      .catch((err) => { setError(err.message); setLoading(false) })
  }, [billId])

  const togglePerson = (id: string) => {
    setExpandedPeople((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const buildShareText = () => {
    if (!result) return ''
    const lines = ['💰 Bill Split Summary\n']
    result.people.forEach((p) => lines.push(`${p.name}: ${formatCurrency(p.total)}`))
    lines.push(`\nTotal: ${formatCurrency(result.final_bill_total)}`)
    lines.push('✅ Verified by SplitSmart')
    return lines.join('\n')
  }

  const handleShare = async () => {
    const text = buildShareText()
    if (navigator.share) {
      await navigator.share({ title: 'Bill Split', text })
    } else {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  /* ── Loading state ─────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-100" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-500 animate-ring-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-emerald-300 animate-ring-spin-slow" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Receipt className="text-emerald-600" size={20} />
            </div>
          </div>
          <p className="text-sm text-ink-500 animate-pulse-soft">Calculating final splits…</p>
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-2xl w-full" />
        ))}
      </div>
    )
  }

  /* ── Error state ───────────────────────────────────────────────────────── */
  if (error || !result) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="card p-8 text-center">
          <p className="text-danger-600 font-semibold mb-4">{error || 'No result found'}</p>
          <button id="btn-back-from-error" onClick={onBack} className="btn-secondary mr-3">
            ← Go back
          </button>
          <button id="btn-start-over" onClick={onReset} className="btn-primary">
            Start over
          </button>
        </div>
      </div>
    )
  }

  /* ── Result ────────────────────────────────────────────────────────────── */
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32 space-y-4">
      {/* Confetti + reconciled badge */}
      {result.reconciled && (
        <div className="animate-slide-up">
          <ConfettiBurst />
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-xl">
            <CheckCircle2 size={18} />
            Fully reconciled — every penny accounted for
          </div>
        </div>
      )}

      {/* Bill total hero */}
      <div className="card p-6 text-center animate-scale-in">
        <p className="text-xs text-ink-400 uppercase tracking-widest font-semibold mb-2">Total Bill</p>
        <p className="text-4xl font-extrabold text-ink-900">
          <AnimatedAmount value={result.final_bill_total} />
        </p>
        <p className="text-xs text-ink-400 mt-2">Split {result.people.length} ways</p>
        <button
          id="btn-share-result"
          onClick={handleShare}
          className="btn-secondary text-sm px-4 py-2 flex items-center gap-2 mx-auto mt-4"
        >
          {copied ? <><Copy size={15} /> Copied!</> : <><Share2 size={15} /> Share summary</>}
        </button>
      </div>

      {/* Per-person cards */}
      {result.people.map((person, idx) => {
        const isExpanded = expandedPeople.has(person.person_id)
        const hasTaxes = person.tax_breakdown.length > 0
        const hasDiscount = parseFloat(person.discount_share) > 0
        const hasSvc = parseFloat(person.service_charge_share) > 0

        return (
          <div
            key={person.person_id}
            className="card overflow-hidden animate-slide-up"
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <button
              id={`btn-expand-person-${person.person_id}`}
              onClick={() => togglePerson(person.person_id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-stone-50/70 transition-colors"
              aria-expanded={isExpanded}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-sm ring-2',
                    PERSON_COLORS[idx % PERSON_COLORS.length],
                    RING_COLORS[idx % RING_COLORS.length]
                  )}
                >
                  {person.name[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-ink-900">{person.name}</p>
                  <p className="text-xs text-ink-400">
                    {person.line_breakdown.length} item{person.line_breakdown.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-extrabold text-emerald-600 tabular-nums">
                  <AnimatedAmount value={person.total} />
                </p>
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center bg-stone-100 transition-transform duration-200',
                    isExpanded ? 'rotate-180' : 'rotate-0'
                  )}
                >
                  <ChevronDown size={16} className="text-ink-400" />
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-stone-100 px-5 pb-4 animate-slide-up">
                {person.line_breakdown.length > 0 && (
                  <div className="pt-3">
                    <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Items</p>
                    {person.line_breakdown.map((line, li) => (
                      <div key={li} className="flex justify-between text-sm py-1.5 border-b border-stone-50 last:border-0">
                        <span className="text-ink-700">
                          {line.item_name}
                          {parseFloat(line.allocated_quantity) < 1 && (
                            <span className="text-ink-400 ml-1 text-xs">×{line.allocated_quantity}</span>
                          )}
                        </span>
                        <span className="tabular-nums font-medium text-ink-900">
                          {formatCurrency(line.line_total_share)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-stone-100 pt-3 mt-2 space-y-1.5">
                  <div className="flex justify-between text-sm text-ink-500">
                    <span>Food subtotal</span>
                    <span className="tabular-nums">{formatCurrency(person.food_subtotal)}</span>
                  </div>
                  {hasTaxes && person.tax_breakdown.map(([name, amount]) => (
                    <div key={name} className="flex justify-between text-sm text-ink-500">
                      <span>{name}</span>
                      <span className="tabular-nums">{formatCurrency(amount)}</span>
                    </div>
                  ))}
                  {hasSvc && (
                    <div className="flex justify-between text-sm text-ink-500">
                      <span>Service charge</span>
                      <span className="tabular-nums">{formatCurrency(person.service_charge_share)}</span>
                    </div>
                  )}
                  {hasDiscount && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Discount</span>
                      <span className="tabular-nums">−{formatCurrency(person.discount_share)}</span>
                    </div>
                  )}
                  {parseFloat(person.rounding_adjustment) !== 0 && (
                    <div className="flex justify-between text-xs text-ink-400">
                      <span>Rounding adjustment</span>
                      <span className="tabular-nums">
                        {parseFloat(person.rounding_adjustment) > 0 ? '+' : ''}
                        {formatCurrency(person.rounding_adjustment)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="border-t border-stone-200 pt-3 mt-1 flex justify-between items-center">
                  <span className="font-bold text-ink-900">Total</span>
                  <span className="text-xl font-extrabold text-emerald-600 tabular-nums">
                    {formatCurrency(person.total)}
                  </span>
                </div>

                <p className="text-[10px] text-ink-300 pt-2 flex items-center gap-1">
                  <Sparkles size={10} />
                  All shares calculated deterministically — never by AI
                </p>
              </div>
            )}
          </div>
        )
      })}

      {/* Grand total sanity check */}
      <div className="card overflow-hidden animate-slide-up">
        <button
          id="btn-toggle-reconciliation"
          onClick={() => setShowReconciliation((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-stone-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className={result.reconciled ? 'text-emerald-600' : 'text-amber-500'} size={18} />
            <span className="font-bold text-ink-900">Bill Reconciliation</span>
          </div>
          <ChevronDown
            size={16}
            className={cn('text-ink-400 transition-transform duration-200', showReconciliation ? 'rotate-180' : '')}
          />
        </button>

        {showReconciliation && (
          <div className="border-t border-stone-100 px-5 py-4 space-y-2 animate-slide-up">
            {[
              { label: 'Items subtotal', value: result.items_subtotal },
              ...(parseFloat(result.discount_total) > 0 ? [{ label: 'Total discount', value: `-${result.discount_total}`, green: true }] : []),
              ...(parseFloat(result.service_charge_total) > 0 ? [{ label: 'Service charge', value: result.service_charge_total }] : []),
              ...result.tax_totals.map(([name, amount]) => ({ label: name, value: amount })),
            ].map(({ label, value, green }) => (
              <div key={label} className={cn('flex justify-between text-sm', green ? 'text-emerald-600' : 'text-ink-600')}>
                <span>{label}</span>
                <span className="tabular-nums font-medium">{formatCurrency(value)}</span>
              </div>
            ))}
            <div className="border-t border-stone-200 pt-2 space-y-1.5">
              {[
                { label: 'Final bill total', value: result.final_bill_total },
                { label: 'Sum of all shares', value: result.people_total },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm font-bold text-ink-900">
                  <span>{label}</span>
                  <span className="tabular-nums">{formatCurrency(value)}</span>
                </div>
              ))}
              <div
                className={cn(
                  'flex items-center gap-2 mt-2 px-3 py-2 rounded-lg text-sm font-semibold',
                  result.reconciled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                )}
              >
                {result.reconciled ? (
                  <><CheckCircle2 size={16} /> ✓ Fully reconciled</>
                ) : (
                  '⚠ Reconciliation mismatch — please check assignments'
                )}
              </div>
            </div>
            {result.rounding_log.length > 0 && (
              <div className="pt-3">
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Rounding log</p>
                {result.rounding_log.map((entry, i) => (
                  <p key={i} className="text-xs text-ink-400">{entry}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Split another */}
      <div className="pb-8 text-center animate-fade-in">
        <button
          id="btn-new-bill"
          onClick={onReset}
          className="btn-ghost text-sm group"
        >
          Split another bill
          <span className="ml-1 group-hover:translate-x-1 transition-transform inline-block">→</span>
        </button>
      </div>

      {/* Sticky bottom */}
      <div className="sticky-bottom">
        <button
          id="btn-step4-back"
          onClick={onBack}
          className="btn-secondary px-5 py-4 flex items-center gap-2"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          id="btn-step4-share"
          onClick={handleShare}
          className="btn-primary flex-1 py-4 flex items-center justify-center gap-2 text-base"
        >
          {copied ? <><Copy size={18} /> Copied!</> : <><Share2 size={18} /> Share Split</>}
        </button>
      </div>
    </div>
  )
}
