import { useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles, Receipt, ShieldCheck } from 'lucide-react'
import bgImage from '../assets/landing-bg.png'

export default function IntroPage() {
  const navigate = useNavigate()

  const handleStart = () => {
    navigate('/upload')
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden select-none bg-slate-950 font-sans">
      {/* Background Image Container */}
      <div 
        className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat transition-transform duration-1000 ease-out scale-100 hover:scale-105"
        style={{
          backgroundImage: `url(${bgImage})`,
        }}
      />

      {/* Atmospheric Overlays - increased transparency so vibrant artwork shines through */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/45 via-slate-950/20 to-slate-950/55" />
      
      {/* Subtle radial vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-slate-950/15 to-slate-950/45 pointer-events-none" />

      {/* Top Navigation Bar */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500/30 to-indigo-500/30 backdrop-blur-md border border-purple-300/30 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-200">
            <Receipt className="text-purple-300" size={22} />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-lg tracking-tight text-white drop-shadow-md">
              Smart Bill Splitter
            </span>
            <span className="text-[10px] uppercase tracking-widest text-purple-300 font-bold">
              AI Powered · Cent Exact
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/docs` : (import.meta.env.PROD ? '/api/docs' : 'http://localhost:8000/api/docs')}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-white/90 bg-white/10 backdrop-blur-md border border-purple-300/20 hover:bg-purple-600/30 hover:text-white transition-all shadow-sm"
          >
            <ShieldCheck size={14} className="text-purple-300" />
            API Docs
          </a>
        </div>
      </header>

      {/* Hero Center Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 text-center my-auto">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          {/* Subtle Tagline Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-purple-300/30 text-white/95 text-xs sm:text-sm font-medium mb-6 shadow-xl animate-fade-in">
            <Sparkles size={14} className="text-purple-300 animate-pulse" />
            <span>AI-Driven Receipt Recognition & Exact Calculation</span>
          </div>

          {/* Main Heading */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black text-white tracking-tight leading-[1.08] mb-6 drop-shadow-[0_8px_32px_rgba(0,0,0,0.7)] animate-slide-up">
            Smart Bill Splitter
          </h1>

          {/* Text Below Heading */}
          <p className="text-lg sm:text-2xl md:text-3xl font-medium text-white/95 max-w-2xl mx-auto leading-relaxed mb-10 drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)] tracking-wide animate-slide-up">
            Split your Bill not your Friendship
          </p>

          {/* Start Button */}
          <div className="animate-slide-up">
            <button
              id="btn-start"
              onClick={handleStart}
              className="group relative inline-flex items-center justify-center gap-3 px-10 py-5 text-lg sm:text-xl font-bold text-slate-950 bg-white hover:bg-gradient-to-r hover:from-purple-600 hover:via-violet-600 hover:to-indigo-600 hover:text-white rounded-2xl shadow-[0_12px_40px_rgba(124,58,237,0.35)] hover:shadow-[0_16px_50px_rgba(147,51,234,0.5)] transition-all duration-300 transform hover:-translate-y-1 active:translate-y-0 active:scale-95 cursor-pointer border border-white/80"
            >
              <span className="tracking-wide">Start</span>
              <div className="w-8 h-8 rounded-xl bg-purple-950/10 group-hover:bg-white/20 flex items-center justify-center group-hover:translate-x-1 transition-all duration-200">
                <ArrowRight size={20} className="text-slate-950 group-hover:text-white transition-colors" />
              </div>
            </button>
          </div>

          {/* Trust Highlights */}
          <div className="mt-14 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-white/85 text-xs sm:text-sm font-medium animate-fade-in drop-shadow-md">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>Zero Arithmetic Errors</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-400" />
              <span>Proportional Tax & Tip</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
              <span>Itemized Per-Person Shares</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-xs text-white/60 drop-shadow-sm">
        <p>© {new Date().getFullYear()} Smart Bill Splitter. Safe, deterministic & private.</p>
      </footer>
    </div>
  )
}
