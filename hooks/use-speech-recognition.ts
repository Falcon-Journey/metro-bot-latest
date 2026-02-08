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

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalRef = useRef("")

  useEffect(() => {
    if (typeof window === "undefined") return
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    setSupported(true)

    const rec = new SR() as SpeechRecognition
    rec.lang = options.lang ?? "en-US"
    rec.continuous = options.continuous ?? true
    rec.interimResults = options.interimResults ?? true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      setListening(true)
      setError(null)
    }

    rec.onend = () => {
      setListening(false)
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      const code = e.error ?? "unknown"
      setError(code)
      setListening(false)
    }

    rec.onresult = (e: SpeechRecognitionEvent) => {
      try {
        let interim = ""
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          const txt = r[0]?.transcript ?? ""
          if (r.isFinal) {
            finalRef.current += (finalRef.current ? " " : "") + txt
          } else {
            interim += txt
          }
        }
        setFinalTranscript(finalRef.current)
        setInterimTranscript(interim)
      } catch {
        setError("speech_result_error")
      }
    }

    recognitionRef.current = rec
    return () => {
      try {
        rec.abort?.()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
  }, [options.lang, options.continuous, options.interimResults])

  const start = useCallback(() => {
    const r = recognitionRef.current
    if (!r) return
    setError(null)
    finalRef.current = ""
    setFinalTranscript("")
    setInterimTranscript("")
    try {
      r.lang = options.lang ?? "en-US"
      r.continuous = options.continuous ?? true
      r.interimResults = options.interimResults ?? true
      r.start()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "start_failed"
      setError(msg)
    }
  }, [options.lang, options.continuous, options.interimResults])

  const stop = useCallback(() => {
    const r = recognitionRef.current
    if (!r) return
    try {
      r.stop()
    } catch {
      // ignore
    }
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

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
