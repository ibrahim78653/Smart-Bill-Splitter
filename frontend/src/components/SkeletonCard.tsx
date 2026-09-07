/** Skeleton shimmer card for loading states */
import { cn } from '../lib/utils'

interface SkeletonCardProps {
  className?: string
  rows?: number
}

export function SkeletonCard({ className, rows = 3 }: SkeletonCardProps) {
  return (
    <div className={cn('card p-5 space-y-3', className)}>
      <div className="skeleton-title w-2/5" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 items-center">
          <div className="skeleton h-8 w-8 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton-text" style={{ width: `${65 + i * 10}%` }} />
            <div className="skeleton h-3 rounded-md w-1/3" />
          </div>
          <div className="skeleton h-6 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonLineItem() {
  return (
    <div className="px-5 py-4 border-b border-stone-50 last:border-0">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 space-y-2">
          <div className="skeleton-title w-3/5" />
          <div className="flex gap-2">
            <div className="skeleton h-5 w-14 rounded-full" />
            <div className="skeleton h-5 w-16 rounded-full" />
          </div>
        </div>
        <div className="skeleton h-8 w-8 rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1">
            <div className="skeleton h-3 w-12 rounded" />
            <div className="skeleton h-5 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonPersonCard() {
  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="skeleton w-10 h-10 rounded-full" />
          <div className="space-y-1.5">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton h-3 w-16 rounded" />
          </div>
        </div>
        <div className="skeleton h-7 w-20 rounded-lg" />
      </div>
    </div>
  )
}

export function SkeletonSummary() {
  return (
    <div className="card p-5 space-y-3">
      <div className="skeleton-title w-1/3 mb-4" />
      {[80, 60, 70, 90].map((w, i) => (
        <div key={i} className="flex justify-between items-center">
          <div className="skeleton h-4 rounded" style={{ width: `${w * 0.4}%` }} />
          <div className="skeleton h-4 w-20 rounded" />
        </div>
      ))}
      <div className="border-t border-stone-100 pt-3 flex justify-between">
        <div className="skeleton h-5 w-28 rounded" />
        <div className="skeleton h-5 w-24 rounded" />
      </div>
    </div>
  )
}
