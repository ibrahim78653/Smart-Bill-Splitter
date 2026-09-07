/**
 * Step1Review — Upload & OCR Review
 * Shows bill image preview + editable table of line items.
 * Allows inline editing, adding/deleting rows.
 * Recalculates subtotal/tax/total live; enables Next only when they reconcile.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, ImagePlus, Loader2,
  Plus, Receipt, X,
} from 'lucide-react'
import { useBillStore } from '../../store/billStore'
import type { LineItem, Tax } from '../../store/billStore'
import { updateBill, confirmBill, uploadBill } from '../../lib/api'
import { cn, formatCurrency } from '../../lib/utils'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const TOLERANCE = 0.05

function newItem(): LineItem {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: '',
    quantity: '1',
    unit_price: '',
    line_total: '',
    category: null,
    confidence: {},
    warnings: [],
    user_edited: true,
  }
}

function parseNum(v: string | null | undefined): number {
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

interface Props {
  billId: string
  onNext: () => void
}

export default function Step1Review({ billId, onNext }: Props) {
  const { bill, setBill, imageUrl, setImageUrl } = useBillStore()

  /* Local editable copy of items */
  const [items, setItems] = useState<LineItem[]>(() => bill?.line_items ?? [])
  const [tax, setTax] = useState<number>(() =>
    (bill?.taxes ?? []).reduce((s, t) => s + parseNum(t.amount), 0)
  )
  const [taxName, setTaxName] = useState(() =>
    bill?.taxes?.[0]?.name ?? 'Tax'
  )
  const [uploadLoading, setUploadLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* Sync from store when bill loads */
  useEffect(() => {
    if (bill) {
      setItems(bill.line_items)
      setTax(bill.taxes.reduce((s, t) => s + parseNum(t.amount), 0))
      setTaxName(bill.taxes?.[0]?.name ?? 'Tax')
    }
  }, [bill?.bill_id])

  /* Derived totals */
  const subtotal = items.reduce((s, i) => s + parseNum(i.line_total), 0)
  const total = subtotal + tax
  const billTotal = parseNum(bill?.total_printed ?? bill?.total_calculated)
  const reconciles = billTotal === 0 || Math.abs(total - billTotal) <= TOLERANCE

  /* ── Image handling ────────────────────────────────────────────────────── */
  const getImageUrl = (imgPath?: string) => {
    if (!imgPath) return null
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('blob:') || imgPath.startsWith('data:')) {
      return imgPath
    }
    const filename = imgPath.replace(/^.*[\\\/]/, '')
    return `${API_BASE}/uploads/${filename}`
  }

  const imagePreview = imageUrl ?? getImageUrl(bill?.source_images?.[0])

  const handleFileChange = async (files: FileList | null) => {
    if (!files?.length) return
    const file = files[0]
    // Show local preview immediately
    setImageUrl(URL.createObjectURL(file))
    // Upload to backend to get a fresh OCR
    setUploadLoading(true)
    setError(null)
    try {
      const { bill_id: newId } = await uploadBill([file])
      // Can't switch billId mid-wizard easily; just show preview
      console.log('Re-uploaded as', newId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploadLoading(false)
    }
  }

  /* ── Item editing ──────────────────────────────────────────────────────── */
  const updateField = useCallback(
    (id: string, field: keyof LineItem, value: string) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item
          const updated = { ...item, [field]: value, user_edited: true }
          // Auto-calc line_total when qty or unit_price changes
          if ((field === 'quantity' || field === 'unit_price') && updated.unit_price) {
            const lt = parseNum(updated.quantity) * parseNum(updated.unit_price)
            updated.line_total = lt.toFixed(2)
          }
          return updated
        })
      )
    },
    []
  )

  const addRow = () => setItems((prev) => [...prev, newItem()])

  const deleteRow = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id))

  /* ── Save & Next ───────────────────────────────────────────────────────── */
  const handleNext = async () => {
    setSaving(true)
    setError(null)
    try {
      // Patch bill with edited items + recomputed taxes
      const taxes: Tax[] = [{ name: taxName, rate: null, amount: tax.toFixed(2), confidence: 'medium' }]
      const updated = await updateBill(billId, { line_items: items, taxes })
      setBill(updated)
      await confirmBill(billId)
      onNext()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!bill) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="animate-spin text-emerald-500" size={28} />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-32 space-y-6">
      {/* Two-column layout on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── Left: Bill Image Preview ─────────────────────────────────── */}
        <div className="card p-5 flex flex-col gap-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="text-emerald-600" size={18} />
              <h2 className="font-bold text-ink-900">Bill Image</h2>
            </div>
            <button
              id="btn-replace-image"
              onClick={() => fileInputRef.current?.click()}
              className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
              disabled={uploadLoading}
            >
              {uploadLoading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
              Replace
            </button>
          </div>

          {imagePreview ? (
            <div className="rounded-xl overflow-hidden border border-stone-100 bg-stone-50">
              <img
                src={imagePreview}
                alt="Bill"
                className="w-full object-contain max-h-[420px]"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          ) : (
            <div
              className="rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center gap-3 py-12 cursor-pointer hover:border-emerald-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="text-stone-400" size={32} />
              <p className="text-sm text-ink-500 text-center">No preview available<br /><span className="text-emerald-600 font-medium">Click to upload</span></p>
            </div>
          )}

          {/* Merchant info */}
          {bill.merchant_name && (
            <div className="border-t border-stone-100 pt-3">
              <p className="text-xs text-ink-400 uppercase tracking-wide font-medium">Restaurant</p>
              <p className="font-semibold text-ink-900 mt-0.5">{bill.merchant_name}</p>
              {bill.bill_date && <p className="text-xs text-ink-400 mt-0.5">{bill.bill_date}</p>}
            </div>
          )}
        </div>

        {/* ── Right: Summary panel ─────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* Reconciliation status */}
          <div
            className={cn(
              'card p-4 flex items-start gap-3 animate-slide-up',
              reconciles ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'
            )}
          >
            {reconciles ? (
              <CheckCircle2 className="text-emerald-600 flex-shrink-0 mt-0.5" size={18} />
            ) : (
              <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
            )}
            <div className="text-sm">
              <p className={cn('font-semibold', reconciles ? 'text-emerald-800' : 'text-amber-800')}>
                {reconciles ? 'Totals reconcile ✓' : 'Totals don\'t match — fix line items below'}
              </p>
              <div className="mt-1.5 space-y-0.5 text-xs text-ink-500">
                <div className="flex justify-between gap-6">
                  <span>Items subtotal</span>
                  <span className="tabular-nums font-medium">{formatCurrency(subtotal.toFixed(2), bill.currency)}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span>{taxName}</span>
                  <span className="tabular-nums font-medium">{formatCurrency(tax.toFixed(2), bill.currency)}</span>
                </div>
                <div className="flex justify-between gap-6 border-t border-stone-200 pt-1 mt-1">
                  <span className="font-semibold text-ink-700">Your total</span>
                  <span className="tabular-nums font-bold text-ink-900">{formatCurrency(total.toFixed(2), bill.currency)}</span>
                </div>
                {billTotal > 0 && (
                  <div className="flex justify-between gap-6">
                    <span>Bill total (printed)</span>
                    <span className={cn('tabular-nums font-medium', reconciles ? 'text-emerald-700' : 'text-amber-700')}>
                      {formatCurrency(billTotal.toFixed(2), bill.currency)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tax editor */}
          <div className="card p-4 space-y-3 animate-slide-up" style={{ animationDelay: '60ms' }}>
            <p className="text-xs text-ink-400 font-semibold uppercase tracking-wide">Tax / Charges</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-500 mb-1 block">Label</label>
                <input
                  id="input-tax-name"
                  className="input-field py-2 text-sm"
                  value={taxName}
                  onChange={(e) => setTaxName(e.target.value)}
                  placeholder="Tax / GST / VAT"
                />
              </div>
              <div>
                <label className="text-xs text-ink-500 mb-1 block">Amount</label>
                <input
                  id="input-tax-amount"
                  className="input-field py-2 text-sm"
                  type="number"
                  step="0.01"
                  min="0"
                  value={tax}
                  onChange={(e) => setTax(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Editable line-items table ─────────────────────────────────────── */}
      <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: '80ms' }}>
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-ink-900">Line Items</h3>
            <p className="text-xs text-ink-400 mt-0.5">Edit any cell — totals update live</p>
          </div>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table header */}
        <div className="grid items-center px-5 py-2.5 bg-stone-50 border-b border-stone-100 text-xs font-semibold text-ink-400 uppercase tracking-wide" style={{ gridTemplateColumns: '1fr 80px 100px 110px 40px' }}>
          <span>Item</span>
          <span>Qty</span>
          <span>Unit Price</span>
          <span>Line Total</span>
          <span />
        </div>

        {/* Table rows */}
        <div className="divide-y divide-stone-50">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="grid items-center px-5 py-2.5 gap-2 hover:bg-stone-50/60 transition-colors group"
              style={{ gridTemplateColumns: '1fr 80px 100px 110px 40px', animationDelay: `${idx * 30}ms` }}
            >
              <input
                id={`item-name-${item.id}`}
                className="input-field py-2 text-sm"
                placeholder="Item name"
                value={item.name}
                onChange={(e) => updateField(item.id, 'name', e.target.value)}
              />
              <input
                id={`item-qty-${item.id}`}
                className="input-field py-2 text-sm text-center"
                type="number"
                step="0.5"
                min="0"
                placeholder="1"
                value={item.quantity}
                onChange={(e) => updateField(item.id, 'quantity', e.target.value)}
              />
              <input
                id={`item-price-${item.id}`}
                className="input-field py-2 text-sm text-right"
                type="number"
                step="0.01"
                min="0"
                placeholder="—"
                value={item.unit_price ?? ''}
                onChange={(e) => updateField(item.id, 'unit_price', e.target.value)}
              />
              <input
                id={`item-total-${item.id}`}
                className={cn(
                  'input-field py-2 text-sm text-right font-semibold',
                  !item.line_total ? 'border-amber-300 bg-amber-50/40' : ''
                )}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={item.line_total ?? ''}
                onChange={(e) => updateField(item.id, 'line_total', e.target.value)}
              />
              <button
                id={`btn-delete-item-${item.id}`}
                onClick={() => deleteRow(item.id)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-all opacity-0 group-hover:opacity-100"
                aria-label="Delete row"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>

        {/* Add row */}
        <div className="px-5 py-3 border-t border-stone-50">
          <button
            id="btn-add-row"
            onClick={addRow}
            className="flex items-center gap-2 text-sm text-emerald-600 font-semibold hover:text-emerald-700 transition-colors group"
          >
            <span className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
              <Plus size={13} />
            </span>
            Add item
          </button>
        </div>
      </div>

      {/* ── Warnings ──────────────────────────────────────────────────────── */}
      {bill.warnings.length > 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50/40 animate-slide-up">
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
            <ul className="text-xs text-amber-700 space-y-1">
              {bill.warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-600 text-sm animate-bounce-in">
          {error}
        </div>
      )}

      {/* ── Sticky bottom bar ─────────────────────────────────────────────── */}
      <div className="sticky-bottom">
        {!reconciles && (
          <p className="text-xs text-amber-600 font-medium mb-2 text-center w-full">
            ⚠ Fix totals to reconcile before continuing
          </p>
        )}
        <button
          id="btn-step1-next"
          onClick={handleNext}
          disabled={!reconciles || saving}
          className="btn-primary flex-1 py-4 flex items-center justify-center gap-2 text-base"
        >
          {saving ? (
            <><Loader2 size={18} className="animate-spin" /> Saving…</>
          ) : (
            <>Add People →</>
          )}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic,.heif"
        className="hidden"
        onChange={(e) => handleFileChange(e.target.files)}
      />
    </div>
  )
}
