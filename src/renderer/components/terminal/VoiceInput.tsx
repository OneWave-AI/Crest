import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

// Declare SpeechRecognition types for TypeScript
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: Event & { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

export default function VoiceInput({ onTranscript, disabled = false }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(true)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [volume, setVolume] = useState(0)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Check for browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setIsSupported(false)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Start volume visualization
  const startVolumeVisualization = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.fftSize = 256

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

      const updateVolume = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setVolume(average / 255)
        animationFrameRef.current = requestAnimationFrame(updateVolume)
      }
      updateVolume()
    } catch (err) {
      console.error('Failed to start volume visualization:', err)
    }
  }, [])

  // Stop volume visualization
  const stopVolumeVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setVolume(0)
  }, [])

  const startListening = useCallback(() => {
    if (!isSupported || disabled) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
      startVolumeVisualization()
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      setInterimTranscript(interim)

      if (final) {
        onTranscript(final)
        setInterimTranscript('')
      }
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
      stopVolumeVisualization()
    }

    recognition.onend = () => {
      setIsListening(false)
      setInterimTranscript('')
      stopVolumeVisualization()
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isSupported, disabled, onTranscript, startVolumeVisualization, stopVolumeVisualization])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setInterimTranscript('')
    stopVolumeVisualization()
  }, [stopVolumeVisualization])

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  if (!isSupported) {
    return (
      <button
        disabled
        className="p-2 rounded-lg text-ink-faint cursor-not-allowed opacity-50"
        title="Voice input not supported in this browser"
      >
        <MicOff size={14} />
      </button>
    )
  }

  return (
    <div className="relative">
      {/* Main button */}
      <button
        onClick={toggleListening}
        disabled={disabled}
        className={`relative p-2 rounded-lg transition-all ${
          isListening
            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            : 'text-ink-muted hover:text-ink-bright hover:bg-overlay/[0.08]'
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        title={isListening ? 'Stop voice input' : 'Start voice input'}
      >
        {/* Volume ring indicator */}
        {isListening && (
          <div
            className="absolute inset-0 rounded-lg border-2 border-red-400 animate-pulse"
            style={{
              transform: `scale(${1 + volume * 0.3})`,
              opacity: 0.5 + volume * 0.5,
              transition: 'transform 0.1s, opacity 0.1s'
            }}
          />
        )}

        {isListening ? (
          <div className="relative">
            <Mic size={14} className="animate-pulse" />
            {/* Recording dot */}
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          </div>
        ) : (
          <Mic size={14} />
        )}
      </button>

      {/* Interim transcript tooltip */}
      {interimTranscript && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-surface-4 border border-overlay/10 rounded-lg shadow-xl z-50 max-w-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2">
            <Volume2 size={12} className="text-red-400 animate-pulse flex-shrink-0" />
            <p className="text-sm text-ink italic truncate">{interimTranscript}</p>
          </div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2 h-2 bg-surface-4 border-r border-b border-overlay/10" />
        </div>
      )}
    </div>
  )
}
