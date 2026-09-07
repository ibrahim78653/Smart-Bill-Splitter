import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2, Users, ArrowRight, Receipt } from 'lucide-react'
import { savePeople } from '../lib/api'
import { useBillStore } from '../store/billStore'
import { cn } from '../lib/utils'

export default function PeoplePage() {
  const { billId } = useParams<{ billId: string }>()
  const navigate = useNavigate()
  const { bill, setPeople } = useBillStore()

  const [people, setLocalPeople] = useState<Array<{ id?: string; name: string }>>([
    { name: '' },
    { name: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addPerson = () => {
    if (people.length >= 10) return
    setLocalPeople((p) => [...p, { name: '' }])
  }

  const removePerson = (idx: number) => {
    if (people.length <= 2) return
    setLocalPeople((p) => p.filter((_, i) => i !== idx))
  }

  const updateName = (idx: number, name: string) => {
    setLocalPeople((p) => p.map((person, i) => (i === idx ? { ...person, name } : person)))
  }

  const handleContinue = async () => {
    if (!billId) return
    const invalid = people.filter((p) => !p.name.trim())
    if (invalid.length > 0) {
      setError('All people need a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await savePeople(billId, people)
      setPeople(result.people)
      navigate(`/assign/${billId}`)
    } catch (err: any) {
      setError(err.message)
      setSaving(false)
    }
  }

  const COLORS = [
    'bg-emerald-100 text-emerald-700',
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
    'bg-rose-100 text-rose-700',
    'bg-orange-100 text-orange-700',
    'bg-teal-100 text-teal-700',
    'bg-pink-100 text-pink-700',
    'bg-indigo-100 text-indigo-700',
    'bg-lime-100 text-lime-700',
    'bg-amber-100 text-amber-700',
  ]

  return (
    <div className="min-h-screen bg-surface-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-stone-100 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            id="btn-back-to-review"
            onClick={() => navigate(`/review/${billId}`)}
            className="btn-ghost px-2 py-2"
            aria-label="Back to review"
          >
            ←
          </button>
          <div className="flex items-center gap-2">
            <Users className="text-emerald-600" size={20} />
            <span className="font-bold text-lg text-ink-900">Who's splitting?</span>
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {/* Bill info strip */}
        {bill && (
          <div className="flex items-center gap-3 card p-4">
            <Receipt className="text-emerald-600" size={20} />
            <div>
              <p className="font-semibold text-sm text-ink-900">
                {bill.merchant_name || 'Your Bill'}
              </p>
              <p className="text-xs text-ink-400">{bill.line_items.length} items to split</p>
            </div>
          </div>
        )}

        {/* People list */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100">
            <h3 className="font-bold text-ink-900">People (2–10)</h3>
            <p className="text-xs text-ink-400 mt-0.5">Enter everyone's name — no account needed</p>
          </div>

          <div className="divide-y divide-stone-50">
            {people.map((person, idx) => (
              <div key={idx} className="flex items-center gap-3 px-5 py-3">
                {/* Avatar */}
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                    COLORS[idx % COLORS.length]
                  )}
                  aria-label={`Person ${idx + 1}`}
                >
                  {person.name.trim() ? person.name.trim()[0].toUpperCase() : (idx + 1)}
                </div>

                <input
                  id={`input-person-${idx}`}
                  type="text"
                  placeholder={`Person ${idx + 1}`}
                  value={person.name}
                  onChange={(e) => updateName(idx, e.target.value)}
                  maxLength={40}
                  className="flex-1 bg-transparent border-none outline-none text-ink-900 font-medium placeholder-ink-300 focus:ring-0 text-sm"
                  autoComplete="off"
                />

                {people.length > 2 && (
                  <button
                    id={`btn-remove-person-${idx}`}
                    onClick={() => removePerson(idx)}
                    className="text-ink-300 hover:text-danger-500 transition-colors p-1"
                    aria-label={`Remove person ${idx + 1}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add person */}
          {people.length < 10 && (
            <div className="px-5 py-3 border-t border-stone-50">
              <button
                id="btn-add-person"
                onClick={addPerson}
                className="flex items-center gap-2 text-sm text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
              >
                <Plus size={18} />
                Add person
              </button>
            </div>
          )}
        </div>

        {/* Quick presets */}
        <div className="card p-5">
          <p className="text-xs text-ink-400 font-medium uppercase tracking-wide mb-3">Quick presets</p>
          <div className="flex flex-wrap gap-2">
            {[
              ['2 people', ['Alice', 'Bob']],
              ['3 people', ['Alice', 'Bob', 'Charlie']],
              ['4 people', ['Alice', 'Bob', 'Charlie', 'Diana']],
            ].map(([label, names]) => (
              <button
                key={label as string}
                id={`btn-preset-${(label as string).replace(' ', '-')}`}
                onClick={() => setLocalPeople((names as string[]).map((n) => ({ name: n })))}
                className="chip chip-unselected text-xs"
              >
                {label as string}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-600 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Sticky bottom */}
      <div className="sticky-bottom">
        <button
          id="btn-continue-to-assign"
          onClick={handleContinue}
          disabled={saving || people.some((p) => !p.name.trim())}
          className="btn-primary flex-1 py-4 flex items-center justify-center gap-2 text-base"
        >
          <ArrowRight size={18} />
          {saving ? 'Saving...' : 'Assign Items →'}
        </button>
      </div>
    </div>
  )
}
