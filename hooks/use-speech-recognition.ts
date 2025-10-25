"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type Options = {
  lang?: string
  continuous?: boolean
  interimResults?: boolean
}

export function useSpeechRecognition(options: Options = {}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [interimTranscript, setInterimTranscript] = useState("")
  const [finalTranscript, setFinalTranscript] = useState("")

  const recognitionRef = useRef<any>(null)
  const finalRef = useRef("")
  const shouldListenRef = useRef(false)
  const stoppingRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    setSupported(true)

    const rec = new SR()
    rec.lang = options.lang || "en-US"
    rec.continuous = options.continuous ?? true
    rec.interimResults = options.interimResults ?? true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      setListening(true)
      setError(null)
    }

    rec.onend = () => {
      setListening(false)
      if (shouldListenRef.current && !stoppingRef.current) {
        setTimeout(() => {
          try {
            recognitionRef.current?.start?.()
          } catch (e) {}
        }, 200)
      } else {
        stoppingRef.current = false
      }
    }

    rec.onerror = (e: any) => {
      const code = e?.error || "speech_error"
      setError(code)
      if (shouldListenRef.current && !stoppingRef.current) {
        setTimeout(() => {
          try {
            recognitionRef.current?.start?.()
          } catch {}
        }, 300)
      } else {
        setListening(false)
      }
    }

    rec.onresult = (e: any) => {
      try {
        let interim = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          const txt = r[0]?.transcript ?? ""
          if (r.isFinal) {
            finalRef.current += txt
          } else {
            interim += txt
          }
        }
        setFinalTranscript(finalRef.current)
        setInterimTranscript(interim)
      } catch (err: any) {
        setError(err?.message || "speech_result_error")
      }
    }

    recognitionRef.current = rec
    return () => {
      try {
        recognitionRef.current?.stop?.()
        recognitionRef.current?.abort?.()
      } catch {}
      recognitionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(() => {
    const r = recognitionRef.current
    if (!r) return
    setError(null)
    stoppingRef.current = false
    shouldListenRef.current = true
    finalRef.current = ""
    try {
      r.lang = options.lang || "en-US"
      r.continuous = options.continuous ?? true
      r.interimResults = options.interimResults ?? true
      r.start()
    } catch (e: any) {}
  }, [options.lang, options.continuous, options.interimResults])

  const stop = useCallback(() => {
    const r = recognitionRef.current
    if (!r) return
    shouldListenRef.current = false
    stoppingRef.current = true
    try {
      r.stop()
      r.abort?.()
    } catch {}
  }, [])

  const toggle = useCallback(() => {
    if (shouldListenRef.current) {
      stop()
    } else {
      start()
    }
  }, [start, stop])

  const reset = useCallback(() => {
    finalRef.current = ""
    setFinalTranscript("")
    setInterimTranscript("")
  }, [])

  return {
    supported,
    listening,
    error,
    interimTranscript,
    finalTranscript,
    start,
    stop,
    toggle,
    reset,
  }
}
