/**
 * Step1Review — Upload & OCR Review
 * Shows bill image preview + editable table of line items.
 * Allows inline editing, adding/deleting rows.
 * Recalculates subtotal/tax/total live; enables Next only when they reconcile.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Camera, CheckCircle2, Loader2,
  Plus, Receipt, RefreshCw, X,
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
    Math.round((bill?.taxes ?? []).reduce((s, t) => s + parseNum(t.amount), 0))
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
      setTax(Math.round(bill.taxes.reduce((s, t) => s + parseNum(t.amount), 0)))
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
      // Patch bill with edited items + recomputed taxes (rounded to integer)
      const roundedTax = Math.round(tax)
      const taxes: Tax[] = [{ name: taxName, rate: null, amount: roundedTax.toFixed(2), confidence: 'medium' }]
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
    <div className="max-w-4xl mx-auto px-4 py-6 pb-28 space-y-6">
      {/* ── Top section: Image preview + Totals ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        {/* Left: Image preview with upload / re-upload */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="text-emerald-600" size={18} />
              <span className="font-semibold text-sm text-ink-900">
                {bill?.merchant_name ?? 'Bill Receipt'}
              </span>
            </div>
            {bill?.bill_date && (
              <span className="text-xs text-ink-400">{bill.bill_date}</span>
            )}
          </div>

          <div className="relative bg-stone-900 min-h-[260px] max-h-[420px] flex items-center justify-center overflow-hidden">
            {uploadLoading ? (
              <div className="flex flex-col items-center gap-2 py-12 text-white">
                <Loader2 className="animate-spin text-emerald-400" size={32} />
                <span className="text-xs text-stone-300">Uploading photo...</span>
              </div>
            ) : imagePreview ? (
              <img
                src={imagePreview}
                alt="Bill photo"
                className="w-full h-full object-contain max-h-[420px]"
              />
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center gap-3 py-12 cursor-pointer hover:border-emerald-400 transition-colors"
              >
                <Camera size={32} className="text-ink-400" />
                <p className="text-sm text-ink-500 text-center">No preview available<br /><span className="text-emerald-600 font-medium">Click to upload</span></p>
              </div>
            )}
          </div>

          <div className="p-3 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
            <button
              id="btn-reupload-photo"
              onClick={() => fileInputRef.current?.click()}
              className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 px-3"
            >
              <RefreshCw size={13} />
              {imagePreview ? 'Replace photo' : 'Upload photo'}
            </button>
            <span className="text-xs text-ink-400">
              {items.length} items detected
            </span>
          </div>
        </div>

        {/* Right: Calculated subtotal, tax editor, total status */}
        <div className="space-y-4">
          {/* Reconciliation banner */}
          <div
            className={cn(
              'rounded-2xl p-4 border flex items-start gap-3 animate-fade-in',
              reconciles ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'
            )}
          >
            {reconciles ? (
              <CheckCircle2 className="text-emerald-600 flex-shrink-0 mt-0.5" size={18} />
            ) : (
              <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
            )}
            <div className="text-xs">
              <p className={cn('font-semibold', reconciles ? 'text-emerald-800' : 'text-amber-800')}>
                {reconciles ? 'Totals Reconcile' : 'Total Discrepancy'}
              </p>
              <p className="text-ink-500 mt-0.5 leading-relaxed">
                {reconciles
                  ? 'Calculated total matches printed total.'
                  : `Calculated total (${formatCurrency(total.toFixed(2), bill.currency)}) differs from printed total (${formatCurrency(billTotal.toFixed(2), bill.currency)}) by ${formatCurrency(Math.abs(total - billTotal).toFixed(2), bill.currency)}. You can proceed or edit amounts below.`}
              </p>
            </div>
          </div>

          {/* Subtotal & Total card */}
          <div className="card p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-ink-500">Food Subtotal</span>
              <span className="font-semibold text-ink-900 tabular-nums">{formatCurrency(subtotal.toFixed(2), bill.currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-500">{taxName} (rounded)</span>
              <span className="font-semibold text-ink-900 tabular-nums">{formatCurrency(Math.round(tax).toFixed(2), bill.currency)}</span>
            </div>
            <div className="border-t border-stone-100 pt-2 flex justify-between items-baseline">
              <div>
                <span className="font-bold text-ink-900 text-base">Calculated Total</span>
                {billTotal > 0 && billTotal !== total && (
                  <p className="text-xs text-ink-400">Printed: {formatCurrency(billTotal.toFixed(2), bill.currency)}</p>
                )}
              </div>
              <span className={cn('tabular-nums font-medium', reconciles ? 'text-emerald-700' : 'text-amber-700')}>
                {formatCurrency(total.toFixed(2), bill.currency)}
              </span>
            </div>
          </div>

          {/* Tax editor */}
          <div className="card p-4 space-y-3 animate-slide-up" style={{ animationDelay: '60ms' }}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-400 font-semibold uppercase tracking-wide">Tax / Charges</p>
              <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                Rounded to integer
              </span>
            </div>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-ink-500 block">Amount</label>
                  {tax % 1 !== 0 && (
                    <button
                      type="button"
                      onClick={() => setTax(Math.round(tax))}
                      className="text-[10px] text-purple-600 font-semibold hover:underline"
                    >
                      Round: {Math.round(tax)}
                    </button>
                  )}
                </div>
                <input
                  id="input-tax-amount"
                  className="input-field py-2 text-sm"
                  type="number"
                  step="1"
                  min="0"
                  value={tax}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setTax(isNaN(v) ? 0 : Math.round(v))
                  }}
                  placeholder="0"
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
