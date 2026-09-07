import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Upload, ImagePlus, X, Loader2, Receipt, Sparkles, Zap, Shield } from 'lucide-react'
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

  const FEATURES = [
    {
      icon: <Sparkles size={22} className="text-emerald-600" />,
      bg: 'bg-emerald-50',
      title: 'AI Reads Your Bill',
      desc: 'Gemini Vision extracts every item, price, and tax with high-confidence scoring.',
    },
    {
      icon: <Zap size={22} className="text-sky-600" />,
      bg: 'bg-sky-50',
      title: 'Smart Assignment',
      desc: 'Tap to assign items to people, or describe it in plain English — AI handles the rest.',
    },
    {
      icon: <Shield size={22} className="text-violet-600" />,
      bg: 'bg-violet-50',
      title: 'Exact to the Cent',
      desc: 'Deterministic math, never AI guesses. Tax and discounts split proportionally.',
    },
  ]

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: '#faf9f7' }}>
      {/* Background dot grid */}
      <div className="absolute inset-0 dot-grid opacity-60 pointer-events-none" />

      {/* Gradient blobs */}
      <div className="absolute top-0 right-0 w-[480px] h-[480px] rounded-full opacity-20 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #059669 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 left-0 w-[360px] h-[360px] rounded-full opacity-15 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #0ea5e9 0%, transparent 70%)' }} />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 glass border-b border-white/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
            <Receipt className="text-white" size={18} />
          </div>
          <span className="font-bold text-xl text-ink-900">SplitSmart</span>
        </div>
        <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 tracking-wide">Beta</span>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Hero */}
        <div className="text-center max-w-2xl mx-auto mb-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 text-sm font-semibold px-4 py-2 rounded-full mb-6 border border-emerald-200 shadow-sm animate-bounce-in">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            AI-Powered · Exact to the cent
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold text-ink-900 leading-[1.1] mb-5 text-balance">
            Split the bill.{' '}
            <span className="gradient-text">Not the friendship.</span>
          </h1>

          <p className="text-lg text-ink-500 max-w-xl mx-auto leading-relaxed">
            Photograph your restaurant bill. AI reads every item — you assign who ate what.
            Get transparent shares with every tax and discount allocated precisely.
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
                ? 'border-emerald-500 bg-emerald-50 scale-[1.01] shadow-glow-emerald'
                : files.length
                ? 'border-stone-200 bg-white cursor-default shadow-card'
                : 'border-stone-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/30 hover:shadow-card-hover'
            )}
          >
            {files.length === 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className={cn(
                  'w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-200',
                  dragging ? 'bg-emerald-200 scale-110' : 'bg-emerald-100'
                )}>
                  <ImagePlus className={cn('transition-colors duration-200', dragging ? 'text-emerald-700' : 'text-emerald-600')} size={28} />
                </div>
                <div>
                  <p className="text-ink-900 font-semibold text-lg">
                    {dragging ? 'Drop it here!' : 'Drop your bill photo here'}
                  </p>
                  <p className="text-ink-500 text-sm mt-1">
                    JPG, PNG, HEIC · Up to 15 MB · Multiple images for long bills
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    id="btn-choose-file"
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                    className="btn-primary text-sm px-5 py-2.5 flex items-center gap-2"
                  >
                    <Upload size={16} />
                    Choose file
                  </button>
                  <button
                    id="btn-camera"
                    onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click() }}
                    className="btn-secondary text-sm px-5 py-2.5 flex items-center gap-2"
                  >
                    <Camera size={16} />
                    Camera
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {files.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 bg-stone-50 rounded-xl px-4 py-3 text-left animate-bounce-in hover:bg-stone-100 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden border border-stone-200 shadow-sm">
                      <img
                        src={URL.createObjectURL(f)}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink-900 truncate">{f.name}</p>
                      <p className="text-xs text-ink-400 mt-0.5">
                        {(f.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <button
                      id={`btn-remove-file-${i}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setFiles((prev) => prev.filter((_, j) => j !== i))
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-300 hover:text-danger-500 hover:bg-danger-50 transition-all"
                      aria-label="Remove file"
                    >
                      <X size={16} />
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
            <div className="mt-3 px-4 py-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-600 text-sm animate-bounce-in">
              {error}
            </div>
          )}

          {files.length > 0 && (
            <button
              id="btn-analyze-bill"
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary w-full mt-4 text-base py-4 flex items-center justify-center gap-2 animate-slide-up"
            >
              {loading ? (
                <><Loader2 size={20} className="animate-spin" /> Uploading...</>
              ) : (
                <><Sparkles size={18} /> Analyze Bill →</>
              )}
            </button>
          )}
        </div>

        {/* Features */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl px-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={cn(
                'card p-5 flex flex-col gap-3 hover:-translate-y-1 transition-all duration-200',
                i === 0 ? 'animate-slide-up-delay-1' :
                i === 1 ? 'animate-slide-up-delay-2' : 'animate-slide-up-delay-3'
              )}
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', f.bg)}>
                {f.icon}
              </div>
              <div>
                <p className="font-semibold text-ink-900">{f.title}</p>
                <p className="text-sm text-ink-500 mt-1 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Trust strip */}
        <p className="mt-8 text-xs text-ink-400 text-center animate-fade-in">
          🔒 Images processed securely · No account needed · Exact math, not estimates
        </p>
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
