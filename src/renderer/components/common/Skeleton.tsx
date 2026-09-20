import { CSSProperties } from 'react'

interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded'
  width?: string | number
  height?: string | number
  className?: string
  animation?: 'shimmer' | 'pulse' | 'none'
  style?: CSSProperties
}

export default function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
  animation = 'shimmer',
  style
}: SkeletonProps) {
  const baseClasses = 'bg-overlay/[0.05] relative overflow-hidden'

  const variantClasses = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-xl'
  }

  const animationClasses = {
    shimmer: 'skeleton-shimmer',
    pulse: 'animate-pulse',
    none: ''
  }

  const dimensionStyle: CSSProperties = {
    width: width ?? (variant === 'text' ? '100%' : undefined),
    height: height ?? (variant === 'circular' ? width : undefined),
    ...style
  }

  return (
    <div
      className={`${baseClasses} ${variantClasses[variant]} ${animationClasses[animation]} ${className}`}
      style={dimensionStyle}
    >
      {animation === 'shimmer' && (
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-overlay/[0.08] to-transparent" />
      )}
    </div>
  )
}

// Preset skeleton components for common use cases
interface SkeletonTextProps {
  lines?: number
  lastLineWidth?: string
  spacing?: 'sm' | 'md' | 'lg'
  className?: string
}

export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
  spacing = 'md',
  className = ''
}: SkeletonTextProps) {
  const spacingClasses = {
    sm: 'space-y-1.5',
    md: 'space-y-2',
    lg: 'space-y-3'
  }

  return (
    <div className={`${spacingClasses[spacing]} ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          width={index === lines - 1 ? lastLineWidth : '100%'}
          height={14}
        />
      ))}
    </div>
  )
}

interface SkeletonCardProps {
  showAvatar?: boolean
  showImage?: boolean
  imageHeight?: number
  lines?: number
  className?: string
}

export function SkeletonCard({
  showAvatar = false,
  showImage = false,
  imageHeight = 120,
  lines = 2,
  className = ''
}: SkeletonCardProps) {
  return (
    <div
      className={`p-4 rounded-xl border border-overlay/[0.06] bg-overlay/[0.02] ${className}`}
    >
      {showImage && (
        <Skeleton
          variant="rounded"
          height={imageHeight}
          className="mb-4 -mx-4 -mt-4 rounded-t-xl rounded-b-none"
        />
      )}
      {showAvatar && (
        <div className="flex items-center gap-3 mb-4">
          <Skeleton variant="circular" width={40} height={40} />
          <div className="flex-1">
            <Skeleton variant="text" width="50%" height={14} className="mb-2" />
            <Skeleton variant="text" width="30%" height={12} />
          </div>
        </div>
      )}
      <SkeletonText lines={lines} />
    </div>
  )
}

interface SkeletonListProps {
  count?: number
  showAvatar?: boolean
  className?: string
}

export function SkeletonList({
  count = 5,
  showAvatar = true,
  className = ''
}: SkeletonListProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 p-3 rounded-xl border border-overlay/[0.06] bg-overlay/[0.02]"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {showAvatar && <Skeleton variant="circular" width={36} height={36} />}
          <div className="flex-1">
            <Skeleton variant="text" width="70%" height={14} className="mb-1.5" />
            <Skeleton variant="text" width="40%" height={12} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface SkeletonGridProps {
  count?: number
  columns?: 2 | 3 | 4
  cardHeight?: number
  className?: string
}

export function SkeletonGrid({
  count = 6,
  columns = 3,
  cardHeight = 150,
  className = ''
}: SkeletonGridProps) {
  const gridClasses = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4'
  }

  return (
    <div className={`grid ${gridClasses[columns]} gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="p-4 rounded-xl border border-overlay/[0.06] bg-overlay/[0.02]"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-start justify-between mb-3">
            <Skeleton variant="rounded" width={40} height={40} />
            <Skeleton variant="text" width={60} height={24} />
          </div>
          <Skeleton variant="text" width="80%" height={16} className="mb-2" />
          <Skeleton variant="text" width="60%" height={12} />
        </div>
      ))}
    </div>
  )
}

// Table skeleton
interface SkeletonTableProps {
  rows?: number
  columns?: number
  showHeader?: boolean
  className?: string
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  showHeader = true,
  className = ''
}: SkeletonTableProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {showHeader && (
        <div className="flex gap-4 p-3 border-b border-overlay/[0.06]">
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton
              key={index}
              variant="text"
              width={`${100 / columns}%`}
              height={14}
            />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-4 p-3"
          style={{ animationDelay: `${rowIndex * 30}ms` }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              variant="text"
              width={`${100 / columns}%`}
              height={12}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// Button skeleton
interface SkeletonButtonProps {
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  className?: string
}

export function SkeletonButton({
  size = 'md',
  fullWidth = false,
  className = ''
}: SkeletonButtonProps) {
  const sizeClasses = {
    sm: 'h-8 w-20',
    md: 'h-10 w-28',
    lg: 'h-12 w-36'
  }

  return (
    <Skeleton
      variant="rounded"
      className={`${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    />
  )
}
