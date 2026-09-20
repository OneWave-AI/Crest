import { useState, useEffect, useRef, useMemo } from 'react'

interface SplashScreenProps {
  onComplete: () => void
}

// Generate a grid of pixels with random properties
function generatePixelGrid(cols: number, rows: number) {
  const pixels: Array<{
    x: number
    y: number
    delay: number
    duration: number
    maxOpacity: number
    hue: number
  }> = []

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      pixels.push({
        x,
        y,
        delay: Math.random() * 2,
        duration: 0.5 + Math.random() * 2,
        maxOpacity: 0.1 + Math.random() * 0.4,
        hue: Math.random() > 0.7 ? (Math.random() > 0.5 ? 35 : 160) : 0, // Orange or cyan accents
      })
    }
  }
  return pixels
}

// Animated pixel component
function AnimatedPixel({
  x, y, delay, duration, maxOpacity, hue, progress, pixelSize
}: {
  x: number
  y: number
  delay: number
  duration: number
  maxOpacity: number
  hue: number
  progress: number
  pixelSize: number
}) {
  const time = (progress * 4 + delay) % duration
  const pulse = Math.sin((time / duration) * Math.PI * 2) * 0.5 + 0.5
  const opacity = pulse * maxOpacity * Math.min(progress * 2, 1)

  const color = hue === 0
    ? `rgba(255, 255, 255, ${opacity})`
    : hue === 35
      ? `rgba(204, 120, 92, ${opacity * 1.5})` // Brand orange
      : `rgba(100, 200, 255, ${opacity})` // Cyan

  return (
    <div
      style={{
        position: 'absolute',
        left: x * pixelSize,
        top: y * pixelSize,
        width: pixelSize - 1,
        height: pixelSize - 1,
        backgroundColor: color,
        transition: 'background-color 0.1s',
      }}
    />
  )
}

// Data stream column
function DataStream({ x, speed, height, progress }: { x: number, speed: number, height: number, progress: number }) {
  const chars = useMemo(() => {
    const c = []
    for (let i = 0; i < 30; i++) {
      c.push(String.fromCharCode(0x30A0 + Math.random() * 96))
    }
    return c
  }, [])

  const offset = ((progress * speed * 100) % (height + 400)) - 200

  return (
    <div
      className="absolute text-[10px] font-mono leading-tight pointer-events-none select-none"
      style={{
        left: x,
        top: offset,
        color: 'rgba(204, 120, 92, 0.15)',
        textShadow: '0 0 5px rgba(204, 120, 92, 0.3)',
        writingMode: 'vertical-rl',
      }}
    >
      {chars.map((char, i) => (
        <span
          key={i}
          style={{
            opacity: Math.max(0, 1 - i * 0.05),
          }}
        >
          {char}
        </span>
      ))}
    </div>
  )
}

// 7-segment digit patterns
const SEGMENT_PATTERNS: Record<string, boolean[]> = {
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
}

function SegmentDigit({ digit, isComplete, size }: { digit: string, isComplete: boolean, size: number }) {
  const pattern = SEGMENT_PATTERNS[digit] || SEGMENT_PATTERNS['0']
  const segmentWidth = size * 0.15
  const segmentLength = size * 0.35
  const gap = size * 0.02

  const activeColor = isComplete ? '#FFD700' : '#cc785c'
  const inactiveColor = 'rgba(255, 255, 255, 0.02)'
  const glowColor = isComplete
    ? '0 0 10px rgba(255, 215, 0, 0.9), 0 0 20px rgba(255, 215, 0, 0.6), 0 0 40px rgba(16, 185, 129, 0.4)'
    : '0 0 8px rgba(204, 120, 92, 0.6), 0 0 15px rgba(204, 120, 92, 0.3)'

  const segments = [
    { active: pattern[0], style: { top: 0, left: segmentWidth + gap, width: segmentLength, height: segmentWidth, clipPath: 'polygon(15% 0%, 85% 0%, 100% 50%, 85% 100%, 15% 100%, 0% 50%)' } },
    { active: pattern[1], style: { top: segmentWidth + gap, right: 0, width: segmentWidth, height: segmentLength, clipPath: 'polygon(50% 0%, 100% 15%, 100% 85%, 50% 100%, 0% 85%, 0% 15%)' } },
    { active: pattern[2], style: { top: segmentWidth * 2 + segmentLength + gap * 3, right: 0, width: segmentWidth, height: segmentLength, clipPath: 'polygon(50% 0%, 100% 15%, 100% 85%, 50% 100%, 0% 85%, 0% 15%)' } },
    { active: pattern[3], style: { bottom: 0, left: segmentWidth + gap, width: segmentLength, height: segmentWidth, clipPath: 'polygon(15% 0%, 85% 0%, 100% 50%, 85% 100%, 15% 100%, 0% 50%)' } },
    { active: pattern[4], style: { top: segmentWidth * 2 + segmentLength + gap * 3, left: 0, width: segmentWidth, height: segmentLength, clipPath: 'polygon(50% 0%, 100% 15%, 100% 85%, 50% 100%, 0% 85%, 0% 15%)' } },
    { active: pattern[5], style: { top: segmentWidth + gap, left: 0, width: segmentWidth, height: segmentLength, clipPath: 'polygon(50% 0%, 100% 15%, 100% 85%, 50% 100%, 0% 85%, 0% 15%)' } },
    { active: pattern[6], style: { top: segmentWidth + segmentLength + gap * 2, left: segmentWidth + gap, width: segmentLength, height: segmentWidth, clipPath: 'polygon(15% 0%, 85% 0%, 100% 50%, 85% 100%, 15% 100%, 0% 50%)' } },
  ]

  const totalWidth = segmentWidth * 2 + segmentLength + gap * 2
  const totalHeight = segmentWidth * 3 + segmentLength * 2 + gap * 4

  return (
    <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
      {segments.map((seg, i) => (
        <div
          key={i}
          className="absolute transition-all duration-150"
          style={{
            ...seg.style,
            backgroundColor: seg.active ? activeColor : inactiveColor,
            boxShadow: seg.active ? glowColor : 'none',
          }}
        />
      ))}
    </div>
  )
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [mounted, setMounted] = useState(false)
  const [phase, setPhase] = useState<'counting' | 'complete' | 'fadeout'>('counting')
  const [count, setCount] = useState(0)
  const [progress, setProgress] = useState(0)
  const startTimeRef = useRef(Date.now())
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Generate pixel grid
  const pixelSize = 6
  const cols = Math.ceil((typeof window !== 'undefined' ? window.innerWidth : 1920) / pixelSize)
  const rows = Math.ceil((typeof window !== 'undefined' ? window.innerHeight : 1080) / pixelSize)
  const pixelGrid = useMemo(() => generatePixelGrid(cols, rows), [cols, rows])

  // Data streams
  const dataStreams = useMemo(() => {
    const streams = []
    for (let i = 0; i < 15; i++) {
      streams.push({
        x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1920),
        speed: 0.5 + Math.random() * 1.5,
      })
    }
    return streams
  }, [])

  // Canvas-based infinite pixel grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    let frame = 0
    const animate = () => {
      frame++
      ctx.fillStyle = 'rgba(2, 2, 4, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const gridSize = 4
      const time = frame * 0.02

      // Draw animated pixel grid
      for (let x = 0; x < canvas.width; x += gridSize) {
        for (let y = 0; y < canvas.height; y += gridSize) {
          const noise = Math.sin(x * 0.01 + time) * Math.cos(y * 0.01 + time * 0.7)
          const wave = Math.sin((x + y) * 0.005 + time * 0.5)
          const combined = (noise + wave) * 0.5 + 0.5

          if (Math.random() < 0.002 + combined * 0.003) {
            const brightness = Math.random()
            if (Math.random() > 0.85) {
              // Orange accent pixels
              ctx.fillStyle = `rgba(204, 120, 92, ${brightness * 0.6})`
            } else if (Math.random() > 0.95) {
              // Cyan accent pixels
              ctx.fillStyle = `rgba(100, 200, 255, ${brightness * 0.4})`
            } else {
              // White pixels
              ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.15})`
            }
            ctx.fillRect(x, y, gridSize - 1, gridSize - 1)
          }
        }
      }

      // Draw scanning lines
      const scanY = (frame * 2) % canvas.height
      ctx.fillStyle = 'rgba(204, 120, 92, 0.03)'
      ctx.fillRect(0, scanY, canvas.width, 2)
      ctx.fillRect(0, scanY - 100, canvas.width, 1)

      if (phase !== 'fadeout') {
        requestAnimationFrame(animate)
      }
    }

    animate()

    return () => {
      window.removeEventListener('resize', resize)
    }
  }, [phase])

  useEffect(() => {
    setMounted(true)

    const totalDuration = 3500
    let animationId: number

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current
      const prog = Math.min(elapsed / totalDuration, 1)
      const easedProgress = 1 - Math.pow(1 - prog, 3)

      setProgress(prog)
      setCount(Math.floor(easedProgress * 100))

      if (prog >= 1 && phase === 'counting') {
        setPhase('complete')
        setCount(100)
        setTimeout(() => {
          setPhase('fadeout')
          setTimeout(onComplete, 600)
        }, 500)
      }

      if (prog < 1) {
        animationId = requestAnimationFrame(animate)
      }
    }

    animationId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationId)
  }, [onComplete, phase])

  const digits = count.toString().padStart(3, '0').split('')
  const digitSize = typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.1, 140) : 100
  const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 1080

  return (
    <div className={`fixed inset-0 z-50 bg-surface-void transition-opacity duration-600 ${phase === 'fadeout' ? 'opacity-0' : 'opacity-100'}`}>
      {/* Canvas-based infinite pixel matrix */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ opacity: 0.8 }}
      />

      {/* Secondary pixel grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(204, 120, 92, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(204, 120, 92, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '4px 4px',
        }}
      />

      {/* Larger grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Data streams */}
      {dataStreams.map((stream, i) => (
        <DataStream
          key={i}
          x={stream.x}
          speed={stream.speed}
          height={screenHeight}
          progress={progress}
        />
      ))}

      {/* Horizontal scan lines */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 4px)',
          opacity: 0.6,
        }}
      />

      {/* Glitch lines */}
      {phase === 'counting' && (
        <>
          <div
            className="absolute left-0 right-0 h-[2px] pointer-events-none"
            style={{
              top: `${(progress * 500) % 100}%`,
              background: 'linear-gradient(90deg, transparent, rgba(204, 120, 92, 0.3), transparent)',
              filter: 'blur(1px)',
            }}
          />
          <div
            className="absolute left-0 right-0 h-[1px] pointer-events-none"
            style={{
              top: `${((progress * 700) + 30) % 100}%`,
              background: 'linear-gradient(90deg, transparent, rgba(100, 200, 255, 0.2), transparent)',
            }}
          />
        </>
      )}

      {/* Radial vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, transparent 30%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Corner hex codes - digital detail */}
      <div className="absolute top-4 left-4 font-mono text-[8px] text-overlay/10 leading-relaxed">
        <div>0x{Math.floor(progress * 255).toString(16).padStart(2, '0').toUpperCase()}FF</div>
        <div>MEM: {(progress * 4096).toFixed(0)}K</div>
        <div>CLK: {(Date.now() % 1000000).toString(16).toUpperCase()}</div>
      </div>
      <div className="absolute top-4 right-4 font-mono text-[8px] text-overlay/10 text-right leading-relaxed">
        <div>SYS.INIT</div>
        <div>v2.2.0</div>
        <div>ARM64</div>
      </div>
      <div className="absolute bottom-4 left-4 font-mono text-[8px] text-overlay/10 leading-relaxed">
        <div>&gt;&gt; BOOT SEQUENCE</div>
        <div>&gt;&gt; LOADING KERNEL</div>
        <div>&gt;&gt; {phase === 'complete' ? 'READY' : 'PLEASE WAIT'}</div>
      </div>
      <div className="absolute bottom-4 right-4 font-mono text-[8px] text-overlay/10 text-right leading-relaxed">
        <div>SECTOR: {Math.floor(progress * 128)}/128</div>
        <div>CRC: {progress >= 1 ? 'OK' : 'CALC'}</div>
        <div>PTY: /dev/tty0</div>
      </div>

      {/* Binary rain on edges */}
      <div className="absolute top-20 left-2 font-mono text-[6px] text-overlay/5 leading-none">
        {Array.from({ length: 40 }, (_, i) => (
          <div key={i}>{Math.random() > 0.5 ? '1' : '0'}</div>
        ))}
      </div>
      <div className="absolute top-20 right-2 font-mono text-[6px] text-overlay/5 leading-none text-right">
        {Array.from({ length: 40 }, (_, i) => (
          <div key={i}>{Math.random() > 0.5 ? '1' : '0'}</div>
        ))}
      </div>

      {/* Main content */}
      <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        {/* Glow backdrop */}
        <div
          className="absolute blur-3xl"
          style={{
            width: '600px',
            height: '300px',
            background: phase === 'complete'
              ? 'radial-gradient(ellipse at center, rgba(255, 215, 0, 0.15) 0%, rgba(204, 120, 92, 0.1) 40%, transparent 70%)'
              : 'radial-gradient(ellipse at center, rgba(204, 120, 92, 0.1) 0%, transparent 60%)',
            transition: 'all 0.5s',
          }}
        />

        {/* LED digit display */}
        <div className="relative">
          <div className="flex items-end gap-4">
            {digits.map((digit, i) => (
              <SegmentDigit
                key={i}
                digit={digit}
                isComplete={phase === 'complete'}
                size={digitSize}
              />
            ))}
            <div
              className="flex flex-col items-center justify-center ml-2 transition-all duration-200"
              style={{
                color: phase === 'complete' ? 'rgba(255, 215, 0, 0.8)' : 'rgba(204, 120, 92, 0.6)',
                fontSize: digitSize * 0.4,
                fontFamily: 'monospace',
                fontWeight: 'bold',
                textShadow: phase === 'complete'
                  ? '0 0 10px rgba(255, 215, 0, 0.8), 0 0 20px rgba(16, 185, 129, 0.5)'
                  : '0 0 8px rgba(204, 120, 92, 0.5)',
              }}
            >
              %
            </div>
          </div>

          {/* Panel border */}
          <div
            className="absolute -inset-8 rounded-lg pointer-events-none"
            style={{
              border: '1px solid rgba(204, 120, 92, 0.1)',
              boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.5), 0 0 1px rgba(204, 120, 92, 0.2)',
            }}
          />
        </div>

        {/* Status text */}
        <div className="mt-16 font-mono">
          <span
            className="transition-all duration-300 text-xs uppercase tracking-[0.5em]"
            style={{
              color: phase === 'complete' ? '#FFD700' : 'rgba(204, 120, 92, 0.5)',
              textShadow: phase === 'complete'
                ? '0 0 10px rgba(255, 215, 0, 0.9), 0 0 30px rgba(16, 185, 129, 0.6)'
                : '0 0 5px rgba(204, 120, 92, 0.3)',
            }}
          >
            {phase === 'complete' ? 'SYSTEM READY' : 'INITIALIZING'}
          </span>
          {phase === 'counting' && (
            <span className="animate-pulse" style={{ color: 'rgba(204, 120, 92, 0.5)' }}>_</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-8 w-80 h-1.5 bg-overlay/[0.03] rounded-full overflow-hidden relative">
          {/* Pixel segments in progress bar */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: 40 }, (_, i) => (
              <div
                key={i}
                className="flex-1 mx-[1px] rounded-sm transition-all duration-75"
                style={{
                  backgroundColor: i < (count / 100) * 40
                    ? phase === 'complete'
                      ? `hsl(${45 + i * 2}, 100%, ${50 + i}%)`
                      : 'rgba(204, 120, 92, 0.6)'
                    : 'rgba(255, 255, 255, 0.02)',
                  boxShadow: i < (count / 100) * 40
                    ? phase === 'complete'
                      ? '0 0 4px rgba(255, 215, 0, 0.5)'
                      : '0 0 3px rgba(204, 120, 92, 0.3)'
                    : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Subsystem status */}
        <div className="mt-6 flex gap-6 font-mono text-[9px] text-overlay/20">
          <span className={progress > 0.2 ? 'text-green-500/40' : ''}>CPU {progress > 0.2 ? 'OK' : '--'}</span>
          <span className={progress > 0.4 ? 'text-green-500/40' : ''}>MEM {progress > 0.4 ? 'OK' : '--'}</span>
          <span className={progress > 0.6 ? 'text-green-500/40' : ''}>GPU {progress > 0.6 ? 'OK' : '--'}</span>
          <span className={progress > 0.8 ? 'text-green-500/40' : ''}>NET {progress > 0.8 ? 'OK' : '--'}</span>
        </div>
      </div>
    </div>
  )
}
