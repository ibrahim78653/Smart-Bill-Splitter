/**
 * Step2People — Add participants as removable chips.
 * Minimum 2 people required to proceed.
 */
import { useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-react'
import { savePeople } from '../../lib/api'
import { useBillStore } from '../../store/billStore'
import { cn } from '../../lib/utils'

const CHIP_COLORS = [
  { bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500', remove: 'hover:bg-emerald-200' },
  { bg: 'bg-sky-100',     text: 'text-sky-800',     dot: 'bg-sky-500',     remove: 'hover:bg-sky-200' },
  { bg: 'bg-violet-100',  text: 'text-violet-800',  dot: 'bg-violet-500',  remove: 'hover:bg-violet-200' },
  { bg: 'bg-rose-100',    text: 'text-rose-800',    dot: 'bg-rose-500',    remove: 'hover:bg-rose-200' },
  { bg: 'bg-orange-100',  text: 'text-orange-800',  dot: 'bg-orange-500',  remove: 'hover:bg-orange-200' },
  { bg: 'bg-teal-100',    text: 'text-teal-800',    dot: 'bg-teal-500',    remove: 'hover:bg-teal-200' },
  { bg: 'bg-pink-100',    text: 'text-pink-800',    dot: 'bg-pink-500',    remove: 'hover:bg-pink-200' },
  { bg: 'bg-indigo-100',  text: 'text-indigo-800',  dot: 'bg-indigo-500',  remove: 'hover:bg-indigo-200' },
  { bg: 'bg-lime-100',    text: 'text-lime-800',    dot: 'bg-lime-500',    remove: 'hover:bg-lime-200' },
  { bg: 'bg-amber-100',   text: 'text-amber-800',   dot: 'bg-amber-500',   remove: 'hover:bg-amber-200' },
]

const QUICK_PRESETS = [
  ['Rohit', 'Rahul'],
  ['Rohit', 'Rahul', 'Ramesh'],
  ['Rohit', 'Rahul', 'Ramesh', 'Rakesh'],
]

interface Props {
  billId: string
  onNext: () => void
  onBack: () => void
}

export default function Step2People({ billId, onNext, onBack }: Props) {
  const { people: storedPeople, setPeople } = useBillStore()

  // Init from store if already filled in (back-nav)
  const [names, setNames] = useState<string[]>(() =>
    storedPeople.length > 0 ? storedPeople.map((p) => p.name) : []
  )
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addName = (raw: string) => {
    const name = raw.trim()
    if (!name) return
    if (names.includes(name)) {
      setError(`"${name}" is already in the list`)
      return
    }
    if (names.length >= 10) {
      setError('Maximum 10 people')
      return
    }
    setNames((prev) => [...prev, name])
    setInputValue('')
    setError(null)
  }

  const removeName = (idx: number) => {
    setNames((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addName(inputValue)
    } else if (e.key === 'Backspace' && !inputValue && names.length > 0) {
      setNames((prev) => prev.slice(0, -1))
    }
  }

  const handleNext = async () => {
    if (names.length < 2) {
      setError('Add at least 2 people to split the bill')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await savePeople(billId, names.map((n) => ({ name: n })))
      setPeople(result.people)
      onNext()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const canProceed = names.length >= 2

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-32 space-y-6">
      {/* Hero */}
      <div className="card p-6 animate-slide-up">
        <h2 className="font-bold text-xl text-ink-900 mb-1">Who's splitting the bill?</h2>
        <p className="text-sm text-ink-500">Type a name and press <kbd className="px-1.5 py-0.5 bg-stone-100 rounded text-xs font-mono">Enter</kbd> to add. At least 2 people required.</p>

        {/* Chip input area */}
        <div
          className={cn(
            'mt-5 min-h-[64px] flex flex-wrap gap-2 items-start p-3 rounded-xl border-2 transition-all duration-200 cursor-text',
            'border-stone-200 bg-white focus-within:border-emerald-400 focus-within:shadow-sm'
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {names.map((name, idx) => {
            const c = CHIP_COLORS[idx % CHIP_COLORS.length]
            return (
              <span
                key={idx}
                className={cn(
                  'inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full text-sm font-semibold animate-bounce-in',
                  c.bg, c.text
                )}
              >
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', c.dot)} />
                {name}
                <button
                  id={`btn-remove-person-${idx}`}
                  onClick={(e) => { e.stopPropagation(); removeName(idx) }}
                  className={cn(
                    'w-4 h-4 rounded-full flex items-center justify-center transition-colors ml-0.5',
                    c.remove
                  )}
                  aria-label={`Remove ${name}`}
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              </span>
            )
          })}

          <input
            ref={inputRef}
            id="input-person-name"
            type="text"
            placeholder={names.length === 0 ? 'e.g. Rohit, Rahul…' : 'Add another…'}
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setError(null) }}
            onKeyDown={handleKeyDown}
            maxLength={40}
            className="flex-1 min-w-[140px] bg-transparent border-none outline-none text-sm text-ink-900 placeholder-ink-400 py-1"
            autoComplete="off"
          />
        </div>

        {/* Add button */}
        <button
          id="btn-add-person"
          onClick={() => addName(inputValue)}
          disabled={!inputValue.trim()}
          className="btn-secondary mt-3 text-sm px-4 py-2 flex items-center gap-1.5 disabled:opacity-40"
        >
          <Plus size={15} />
          Add
        </button>
      </div>

      {/* People count visual */}
      <div className="flex items-center gap-2 px-1">
        {Array.from({ length: 10 }).map((_, i) => {
          const c = CHIP_COLORS[i % CHIP_COLORS.length]
          return (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full flex-1 transition-all duration-300',
                i < names.length ? c.dot : 'bg-stone-100'
              )}
            />
          )
        })}
      </div>
      <p className="text-xs text-ink-400 text-center -mt-3">
        {names.length === 0 ? 'No people added yet' : `${names.length} person${names.length !== 1 ? 's' : ''} added`}
        {names.length < 2 && names.length > 0 && ' — add at least 1 more'}
      </p>

      {/* Quick presets */}
      <div className="card p-5 animate-slide-up" style={{ animationDelay: '60ms' }}>
        <p className="text-xs text-ink-400 font-semibold uppercase tracking-wide mb-3">Quick presets</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.join(',')}
              id={`btn-preset-${preset.length}`}
              onClick={() => { setNames(preset); setError(null) }}
              className="chip chip-unselected text-xs"
            >
              {preset.join(', ')}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-600 text-sm animate-bounce-in">
          {error}
        </div>
      )}

      {/* Sticky bottom */}
      <div className="sticky-bottom">
        <button
          id="btn-step2-back"
          onClick={onBack}
          className="btn-secondary px-5 py-4 flex items-center gap-2"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          id="btn-step2-next"
          onClick={handleNext}
          disabled={!canProceed || saving}
          className="btn-primary flex-1 py-4 flex items-center justify-center gap-2 text-base"
        >
          <ArrowRight size={18} />
          {saving ? 'Saving…' : 'Assign Items →'}
        </button>
      </div>
    </div>
  )
}
