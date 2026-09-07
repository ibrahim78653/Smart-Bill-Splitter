import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Upload, ImagePlus, X, Loader2, Receipt } from 'lucide-react'
import { uploadBill } from '../lib/api'
import { cn } from '../lib/utils'

export default function LandingPage() {
  const navigate = useNavigate()
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return
    const valid: File[] = []
    const errors: string[] = []
    Array.from(newFiles).forEach((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase()
      if (!['jpg', 'jpeg', 'png', 'heic', 'heif'].includes(ext || '')) {
        errors.push(`${f.name}: unsupported format`)
      } else if (f.size > 15 * 1024 * 1024) {
        errors.push(`${f.name}: too large (max 15 MB)`)
      } else {
        valid.push(f)
      }
    })
    if (errors.length) setError(errors.join('; '))
    else setError(null)
    setFiles((prev) => [...prev, ...valid].slice(0, 5))
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const handleSubmit = async () => {
    if (!files.length) return
    setLoading(true)
    setError(null)
    try {
      const { bill_id } = await uploadBill(files)
      navigate(`/processing/${bill_id}`)
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-white">
        <div className="flex items-center gap-2">
          <Receipt className="text-emerald-600" size={24} />
          <span className="font-bold text-xl text-ink-900">SplitSmart</span>
        </div>
        <span className="text-xs text-ink-300 font-medium tracking-wide uppercase">Beta</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-12 animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm font-semibold px-4 py-2 rounded-full mb-6 border border-emerald-200">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            AI-Powered · Exact to the cent
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-ink-900 leading-tight mb-4 text-balance">
            Split the bill.{' '}
            <span className="text-emerald-600">Not the friendship.</span>
          </h1>
          <p className="text-lg text-ink-500 max-w-xl mx-auto leading-relaxed">
            Photograph your restaurant bill. Our AI reads every item — you assign
            who ate what. Get exact, transparent shares with every tax and discount
            allocated proportionally.
          </p>
        </div>

        {/* Upload zone */}
        <div className="w-full max-w-xl animate-slide-up">
          <div
            id="upload-zone"
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !files.length && fileInputRef.current?.click()}
            className={cn(
              'relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer',
              dragging
                ? 'border-emerald-500 bg-emerald-50 scale-[1.01]'
                : files.length
                ? 'border-stone-200 bg-white cursor-default'
                : 'border-stone-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/30'
            )}
          >
            {files.length === 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <ImagePlus className="text-emerald-600" size={28} />
                </div>
                <div>
                  <p className="text-ink-900 font-semibold text-lg">
                    Drop your bill photo here
                  </p>
                  <p className="text-ink-500 text-sm mt-1">
                    JPG, PNG, HEIC — up to 15 MB · Multiple images for long bills
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    id="btn-choose-file"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                    className="btn-primary text-sm px-4 py-2.5"
                  >
                    <Upload size={16} className="inline mr-2" />
                    Choose file
                  </button>
                  <button
                    id="btn-camera"
                    onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click() }}
                    className="btn-secondary text-sm px-4 py-2.5"
                  >
                    <Camera size={16} className="inline mr-2" />
                    Camera
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-stone-50 rounded-xl px-4 py-3 text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex-shrink-0 overflow-hidden">
                      <img
                        src={URL.createObjectURL(f)}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-900 truncate">{f.name}</p>
                      <p className="text-xs text-ink-400">
                        {(f.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <button
                      id={`btn-remove-file-${i}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setFiles((prev) => prev.filter((_, j) => j !== i))
                      }}
                      className="text-ink-300 hover:text-danger-500 transition-colors"
                      aria-label="Remove file"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-3 mt-4">
                  <button
                    id="btn-add-more"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                    className="btn-ghost text-sm flex-1"
                    disabled={files.length >= 5}
                  >
                    <ImagePlus size={16} className="inline mr-1.5" />
                    Add another photo
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 px-4 py-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-600 text-sm">
              {error}
            </div>
          )}

          {files.length > 0 && (
            <button
              id="btn-analyze-bill"
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary w-full mt-4 text-base py-4 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 size={20} className="animate-spin" /> Uploading...</>
              ) : (
                <>Analyze Bill →</>
              )}
            </button>
          )}
        </div>

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl px-4 animate-fade-in">
          {[
            { icon: '📸', title: 'AI Reads Your Bill', desc: 'Gemini Vision extracts every item, price, and tax — you review and correct.' },
            { icon: '👥', title: 'Assign to People', desc: 'Drag items to people, split shared dishes, fractional quantities supported.' },
            { icon: '✅', title: 'Exact Shares', desc: 'Deterministic math. Tax, service charge, and discounts allocated proportionally to the cent.' },
          ].map((f) => (
            <div key={f.title} className="card p-5 flex flex-col gap-2">
              <span className="text-2xl">{f.icon}</span>
              <p className="font-semibold text-ink-900">{f.title}</p>
              <p className="text-sm text-ink-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />
    </div>
  )
}
