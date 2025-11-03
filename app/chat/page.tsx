"use client"

import { cn } from "@/lib/utils"
import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"
import VoiceModeUI from "@/components/voice-mode-ui"

// ---------------- Utility functions ---------------- //
function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `session-${Math.random().toString(36).slice(2)}`
}

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[.,!?…]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function sanitizeAssistantOutput(text: string) {
  return text.replace(/<\/sources>/gi, "")
}

// ---------------- MessageList ---------------- //
function MessageList({ messages, loading }: { messages: Message[]; loading?: boolean }) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, loading])
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <div key={m.id} className={cn("flex items-start gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
          {m.role === "assistant" && (
            <Avatar className="size-8">
              <AvatarFallback className="bg-accent text-accent-foreground">MS</AvatarFallback>
            </Avatar>
          )}
          <div
            className={cn(
              "max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed",
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
            )}
          >
            {m.content}
          </div>
          {m.role === "user" && (
            <Avatar className="size-8">
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          )}
        </div>
      ))}
      {loading && (
        <div className="flex items-start gap-3 justify-start">
          <Avatar className="size-8">
            <AvatarFallback className="bg-accent text-accent-foreground">MS</AvatarFallback>
          </Avatar>
          <div className="max-w-[80%] rounded-lg bg-muted px-4 py-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

// ---------------- Chat Input ---------------- //
function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState("")
  const { supported, listening, interimTranscript, finalTranscript, start, stop, reset } = useSpeechRecognition({
    lang: "en-US",
    continuous: true,
    interimResults: true,
  })

  useEffect(() => {
    if (!listening) return
    const combined = (finalTranscript + (interimTranscript ? " " + interimTranscript : "")).trim()
    if (combined) setText(combined)
  }, [listening, interimTranscript, finalTranscript])

  useEffect(() => {
    if (!listening && finalTranscript) setText(finalTranscript.trim())
  }, [listening, finalTranscript])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            aria-label="Message"
            placeholder="Where would you like to go?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                if (disabled) return
                if (text.trim()) {
                  onSend(text.trim())
                  setText("")
                  stop()
                }
              }
            }}
            className="pr-12"
            disabled={disabled}
          />
        </div>
        <Button
          onClick={() => {
            if (disabled) return
            if (!text.trim()) return
            onSend(text.trim())
            setText("")
            stop()
          }}
          className="px-5"
          disabled={disabled || !text.trim()}
        >
          Send
        </Button>
      </div>
      {!supported && <div className="text-xs text-muted-foreground">Speech recognition not supported.</div>}
    </div>
  )
}

// ---------------- Quick Suggestions ---------------- //
function QuickSuggestions({ mode, onPick, disabled }: { mode: "booking" | "retrieve"; onPick: (text: string) => void; disabled?: boolean }) {
  const suggestions =
    mode === "booking"
      ? [
          "Book a ride from DC to NYC this Friday",
          "NYC to DC on Friday for 15 people one way leaving at 9am from Union station and arrive at 2pm at Penn Station",
        ]
      : [
          "What’s the price for a one-way trip from NYC to DC for 15 people?",
          "Who arranges and pays for the driver’s hotel room?",
        ]

  return (
    <div className="w-full">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Quick suggestions</div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((label) => (
          <Button key={label} type="button" variant="outline" disabled={disabled} onClick={() => onPick(label)} className="rounded-full border-primary/30 text-primary hover:bg-primary/10">
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}

// ---------------- Main Chat Page ---------------- //
export default function ChatPage() {
  const [sessionId] = useState(createSessionId)
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: "Welcome to Metropolitan Shuttle! Where would you like to go today?" },
  ])
  const [loading, setLoading] = useState(false)
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false)
  const [mode, setMode] = useState<"booking" | "retrieve">("booking")
  const [isVoiceMode, setIsVoiceMode] = useState(false)

  const invisibleContext = useMemo(() => {
    if (typeof window === "undefined") return ""
    const now = new Date()
    const locale = typeof navigator !== "undefined" ? navigator.language : "en-US"
    const timeString = now.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone?.replace(/_/g, " ")
    return `Context (hidden): Local time is ${timeString}, timezone ${timeZone}`
  }, [])

  const send = async (text: string) => {
    if (loading) return
    const userMsg: Message = { id: `${Date.now()}-u`, role: "user", content: text }
    setMessages((m) => [...m, userMsg])
    setLoading(true)
    const msgId = `${Date.now()}-a`

    try {
      const payload = hasSentFirstMessage || !invisibleContext ? text : `${invisibleContext}\n\n${text}`
      const res = await fetch("/api/bedrock-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: payload, sessionId, mode }),
      })
      if (!res.ok || !res.body) throw new Error(`Request failed: ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        fullText += chunk
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === msgId)
          if (!exists) return [...prev, { id: msgId, role: "assistant", content: chunk }]
          return prev.map((m) => (m.id === msgId ? { ...m, content: fullText } : m))
        })
      }
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, content: sanitizeAssistantOutput(fullText) } : m)))
    } catch (e) {
      console.error("Chat error:", e)
      setMessages((m) => [
        ...m,
        { id: `${Date.now()}-e`, role: "assistant", content: "Sorry, I couldn’t reach the agent." },
      ])
    } finally {
      setLoading(false)
      if (!hasSentFirstMessage) setHasSentFirstMessage(true)
    }
  }

  const handleSuggestionClick = (s: string) => send(s)

  return (
    <main className="flex h-[100dvh] flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-background px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <img src="/images/logo.svg" alt="Metropolitan Shuttle" className="h-6 w-auto" />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-muted-foreground capitalize">
            {mode === "booking" ? "Shuttle Booking Mode" : "Retrieve Mode"}
          </div>
          <Button variant="outline" size="sm" onClick={() => setMode(mode === "booking" ? "retrieve" : "booking")}>
            Switch to {mode === "booking" ? "Retrieve" : "Booking"}
          </Button>
          <Button variant="default" size="sm" onClick={() => setIsVoiceMode(!isVoiceMode)}>
            {isVoiceMode ? "Text Mode" : "Voice Mode"}
          </Button>
        </div>
      </header>

      {/* Conditional Body */}
      {isVoiceMode ? (
        <VoiceModeUI
          handleSuggestionClick={handleSuggestionClick}
          suggestions={mode === "booking"
            ? ["Book a shuttle to NYC", "Book a one-way trip for 15 people"]
            : ["Check price for a trip", "What’s included in the booking?"]}
          isVoiceMode={isVoiceMode}
          setIsVoiceMode={setIsVoiceMode}
        />
      ) : (
        <>
          <section className="flex-1 bg-secondary">
            <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-6 md:px-6 md:py-8">
              <h1 className="text-pretty text-xl font-semibold text-foreground md:text-2xl">
                {mode === "booking" ? "Shuttle Booking Assistant" : "Trip Retrieval Assistant"}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "booking" ? "Let us help you book your shuttle!" : "Ask about past bookings or trip details."}
              </p>
              <div className="mt-6 flex-1 overflow-y-auto">
                <MessageList messages={messages} loading={loading} />
              </div>
            </div>
          </section>
          <footer className="border-t bg-background">
            <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6 md:py-7">
              <div className="mb-3 md:mb-4">
                <QuickSuggestions mode={mode} onPick={handleSuggestionClick} disabled={loading} />
              </div>
              <div className="pb-6 md:pb-6">
                <ChatInput onSend={send} disabled={loading} />
              </div>
            </div>
          </footer>
        </>
      )}
    </main>
  )
}
