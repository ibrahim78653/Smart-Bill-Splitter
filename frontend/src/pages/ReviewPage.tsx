import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle, ChevronDown, ChevronUp,
  Edit3, Receipt, Save, Users
} from 'lucide-react'
import { useBillStore } from '../store/billStore'
import type { LineItem } from '../store/billStore'
import { updateBill, confirmBill } from '../lib/api'
import { formatCurrency, confidenceBadgeClass, confidenceLabel, cn } from '../lib/utils'

export default function ReviewPage() {
  const { billId } = useParams<{ billId: string }>()
  const navigate = useNavigate()
  const { bill, setBill } = useBillStore()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<LineItem>>({})
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showWarnings, setShowWarnings] = useState(true)

  if (!bill) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-ink-500">Loading bill...</p>
      </div>
    )
  }

  const hasWarnings = bill.warnings.length > 0 || bill.line_items.some((i) => i.warnings.length > 0)
  const showReconcileWarning = !bill.reconciles && bill.total_printed !== null

  // Save line item edits
  const handleSaveEdit = async (item: LineItem) => {
    if (!billId) return
    setSaving(true)
    try {
      const updatedItems = bill.line_items.map((li) =>
        li.id === item.id
          ? { ...li, ...editValues, user_edited: true }
          : li
      )
      const updated = await updateBill(billId, { line_items: updatedItems })
      setBill(updated)
      setEditingId(null)
      setEditValues({})
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    if (!billId) return
    setConfirming(true)
    setError(null)
    try {
      await confirmBill(billId)
      navigate(`/people/${billId}`)
    } catch (err: any) {
      setError(err.message)
      setConfirming(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-stone-100 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="text-emerald-600" size={20} />
            <span className="font-bold text-lg text-ink-900">Review Bill</span>
          </div>
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold',
            bill.verification_status === 'confirmed'
              ? 'bg-emerald-100 text-emerald-700'
              : bill.verification_status === 'needs_review'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-stone-100 text-ink-500'
          )}>
            {bill.verification_status === 'confirmed' ? '✓ Confirmed' :
             bill.verification_status === 'needs_review' ? '⚠ Needs Review' : 'Pending'}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {/* Merchant info */}
        {bill.merchant_name && (
          <div className="card p-5">
            <p className="text-xs text-ink-400 font-medium uppercase tracking-wide mb-1">Restaurant</p>
            <h2 className="text-xl font-bold text-ink-900">{bill.merchant_name}</h2>
            {bill.bill_date && (
              <p className="text-sm text-ink-500 mt-0.5">{bill.bill_date}</p>
            )}
          </div>
        )}

        {/* Reconciliation Warning Panel — non-negotiable per spec §13 */}
        {showReconcileWarning && (
          <div className="reconcile-panel reconcile-warn animate-slide-up">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="font-semibold text-amber-900">⚠ Printed total does not reconcile</p>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-amber-700">Expected (calculated):</span>
                    <span className="font-semibold text-amber-900 tabular-nums">
                      {formatCurrency(bill.total_calculated, bill.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700">Printed on receipt:</span>
                    <span className="font-semibold text-amber-900 tabular-nums">
                      {formatCurrency(bill.total_printed, bill.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-amber-200 pt-1 mt-1">
                    <span className="text-amber-700">Difference:</span>
                    <span className="font-bold text-amber-900 tabular-nums">
                      {formatCurrency(bill.reconciliation_diff, bill.currency)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-amber-600 mt-3">
                  Possible reasons: printing error · missing item · unreadable charge · OCR mistake
                </p>
                <p className="text-xs text-amber-700 font-semibold mt-1">
                  The split will use the <u>calculated total</u> based on your confirmed items.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Other warnings */}
        {hasWarnings && bill.warnings.length > 0 && (
          <div className="card p-4">
            <button
              id="btn-toggle-warnings"
              onClick={() => setShowWarnings((v) => !v)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                <AlertTriangle size={16} />
                {bill.warnings.length} notice{bill.warnings.length > 1 ? 's' : ''}
              </span>
              {showWarnings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showWarnings && (
              <ul className="mt-3 space-y-1.5">
                {bill.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-2">
                    <span className="mt-0.5">•</span>
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Line items table */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100">
            <h3 className="font-bold text-ink-900">Items</h3>
            <p className="text-xs text-ink-400 mt-0.5">
              Click any row to correct AI-extracted values
            </p>
          </div>

          <div className="divide-y divide-stone-50">
            {bill.line_items.map((item) => {
              const isEditing = editingId === item.id
              const nameConf = item.confidence?.name || 'medium'
              const priceConf = item.confidence?.unit_price || 'medium'
              const totalConf = item.confidence?.line_total || 'medium'

              return (
                <div
                  key={item.id}
                  className={cn(
                    'px-5 py-4 transition-colors',
                    isEditing ? 'bg-emerald-50/50' : 'hover:bg-stone-50/60'
                  )}
                >
                  {/* Row header */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input
                          id={`edit-name-${item.id}`}
                          className="input-field text-sm font-semibold mb-2"
                          defaultValue={item.name}
                          onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-ink-900 text-sm">{item.name}</p>
                          {item.user_edited && (
                            <span className="text-xs text-emerald-600 font-medium">✏ Edited</span>
                          )}
                        </div>
                      )}

                      {/* Confidence badges */}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <span className={confidenceBadgeClass(nameConf)}>
                          {confidenceLabel(nameConf)}
                        </span>
                        {item.warnings.length > 0 && (
                          <span className="badge-low">⚠ {item.warnings[0]}</span>
                        )}
                      </div>
                    </div>

                    <button
                      id={`btn-edit-item-${item.id}`}
                      onClick={() => {
                        if (isEditing) {
                          setEditingId(null)
                          setEditValues({})
                        } else {
                          setEditingId(item.id)
                          setEditValues({})
                        }
                      }}
                      className="btn-ghost text-xs p-2"
                      aria-label={isEditing ? 'Cancel edit' : 'Edit item'}
                    >
                      {isEditing ? 'Cancel' : <Edit3 size={16} />}
                    </button>
                  </div>

                  {/* Quantity / Price / Total grid */}
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    {[
                      {
                        label: 'Qty', field: 'quantity' as const,
                        value: item.quantity, conf: item.confidence?.quantity,
                      },
                      {
                        label: 'Unit Price', field: 'unit_price' as const,
                        value: item.unit_price, conf: priceConf,
                      },
                      {
                        label: 'Total', field: 'line_total' as const,
                        value: item.line_total, conf: totalConf,
                      },
                    ].map(({ label, field, value, conf }) => (
                      <div key={field}>
                        <p className="text-xs text-ink-400 mb-1">{label}</p>
                        {isEditing ? (
                          <input
                            id={`edit-${field}-${item.id}`}
                            className="input-field text-sm py-2"
                            defaultValue={value || ''}
                            placeholder={value ? '' : '—'}
                            onChange={(e) => setEditValues((v) => ({ ...v, [field]: e.target.value }))}
                          />
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold tabular-nums text-sm text-ink-900">
                              {field === 'quantity' ? (value || '—') : formatCurrency(value, bill.currency)}
                            </span>
                            {conf && (
                              <span className={cn(confidenceBadgeClass(conf), 'text-[10px] w-fit')}>
                                {conf}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Provenance tag */}
                  <p className="text-[10px] text-ink-300 mt-2">
                    {item.user_edited ? '✏ User corrected' : '🤖 AI extracted'}
                  </p>

                  {/* Save button */}
                  {isEditing && (
                    <button
                      id={`btn-save-item-${item.id}`}
                      onClick={() => handleSaveEdit(item)}
                      disabled={saving}
                      className="btn-primary w-full mt-3 py-2.5 text-sm"
                    >
                      <Save size={14} className="inline mr-1.5" />
                      {saving ? 'Saving...' : 'Save changes'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bill summary */}
        <div className="card p-5 space-y-3">
          <h3 className="font-bold text-ink-900 mb-4">Bill Summary</h3>

          <div className="space-y-2 text-sm">
            <SummaryRow label="Items subtotal" value={bill.subtotal_calculated} currency={bill.currency} />
            {parseFloat(bill.discount) > 0 && (
              <SummaryRow label="Discount" value={`-${bill.discount}`} currency={bill.currency} isNegative />
            )}
            {parseFloat(bill.service_charge) > 0 && (
              <SummaryRow label="Service charge" value={bill.service_charge} currency={bill.currency} />
            )}
            {bill.taxes.map((tax) => (
              <SummaryRow key={tax.name} label={tax.name} value={tax.amount} currency={bill.currency} />
            ))}
            <div className="border-t border-stone-100 pt-2 mt-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-ink-900">Total (calculated)</span>
                <span className="money-large">{formatCurrency(bill.total_calculated, bill.currency)}</span>
              </div>
              {bill.total_printed && (
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-ink-400">Printed on receipt</span>
                  <span className={cn(
                    'text-sm tabular-nums',
                    bill.reconciles ? 'text-emerald-600' : 'text-amber-600'
                  )}>
                    {formatCurrency(bill.total_printed, bill.currency)}
                    {bill.reconciles ? ' ✓' : ' ⚠'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-600 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Sticky bottom — Confirm gate */}
      <div className="sticky-bottom">
        <button
          id="btn-confirm-bill"
          onClick={handleConfirm}
          disabled={confirming}
          className="btn-primary flex-1 py-4 flex items-center justify-center gap-2 text-base"
        >
          <Users size={18} />
          {confirming ? 'Confirming...' : 'Confirm & Add People →'}
        </button>
      </div>
    </div>
  )
}

function SummaryRow({
  label, value, currency, isNegative = false
}: { label: string; value: string | null; currency: string; isNegative?: boolean }) {
  return (
    <div className="flex justify-between text-ink-700">
      <span>{label}</span>
      <span className={cn('tabular-nums font-medium', isNegative && 'text-emerald-600')}>
        {formatCurrency(value, currency)}
      </span>
    </div>
  )
}
