"use client"

import { cn } from "@/lib/utils"
import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"

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

// Extract phone number from text
function extractPhoneNumber(text: string): string | null {
  const phoneMatch = text.match(/(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/);
  if (phoneMatch) {
    const digits = phoneMatch[2] + phoneMatch[3] + phoneMatch[4];
    return digits.length === 10 ? digits : phoneMatch[0];
  }
  return null;
}

// ---------------- Markdown Renderer ---------------- //

function MarkdownRenderer({ content }: { content: string }) {
  const renderContent = () => {
    const lines = content.split("\n")
    const elements: React.ReactNode[] = []
    let inTable = false
    let tableRows: string[] = []
    let inCodeBlock = false
    let codeLines: string[] = []
    let currentParagraph: string[] = []

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const text = currentParagraph.join(" ")
        elements.push(
          <p key={elements.length} className="mb-3 leading-relaxed">
            {parseInlineFormatting(text)}
          </p>
        )
        currentParagraph = []
      }
    }

    const flushTable = () => {
      if (tableRows.length > 0) {
        elements.push(renderTable(tableRows, elements.length))
        tableRows = []
        inTable = false
      }
    }

    const flushCodeBlock = () => {
      if (codeLines.length > 0) {
        elements.push(
          <pre key={elements.length} className="mb-4 overflow-x-auto rounded-lg bg-slate-900 p-4">
            <code className="text-sm text-slate-100">{codeLines.join("\n")}</code>
          </pre>
        )
        codeLines = []
        inCodeBlock = false
      }
    }

    lines.forEach((line, idx) => {
      // Code blocks
      if (line.trim().startsWith("```")) {
        flushParagraph()
        if (inCodeBlock) {
          flushCodeBlock()
        } else {
          inCodeBlock = true
        }
        return
      }

      if (inCodeBlock) {
        codeLines.push(line)
        return
      }

      // Table detection
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        flushParagraph()
        inTable = true
        tableRows.push(line)
        return
      } else if (inTable) {
        flushTable()
      }

      // Headers
      if (line.startsWith("### ")) {
        flushParagraph()
        elements.push(
          <h3 key={elements.length} className="mb-2 mt-4 text-base font-semibold">
            {parseInlineFormatting(line.slice(4))}
          </h3>
        )
        return
      }
      if (line.startsWith("## ")) {
        flushParagraph()
        elements.push(
          <h2 key={elements.length} className="mb-3 mt-4 text-lg font-semibold">
            {parseInlineFormatting(line.slice(3))}
          </h2>
        )
        return
      }
      if (line.startsWith("# ")) {
        flushParagraph()
        elements.push(
          <h1 key={elements.length} className="mb-3 mt-4 text-xl font-bold">
            {parseInlineFormatting(line.slice(2))}
          </h1>
        )
        return
      }

      // Bullet lists
      if (line.trim().match(/^[•\-\*]\s+/)) {
        flushParagraph()
        const text = line.trim().replace(/^[•\-\*]\s+/, "")
        elements.push(
          <li key={elements.length} className="mb-1 ml-4 list-disc">
            {parseInlineFormatting(text)}
          </li>
        )
        return
      }

      // Numbered lists
      if (line.trim().match(/^\d+\.\s+/)) {
        flushParagraph()
        const text = line.trim().replace(/^\d+\.\s+/, "")
        elements.push(
          <li key={elements.length} className="mb-1 ml-4 list-decimal">
            {parseInlineFormatting(text)}
          </li>
        )
        return
      }

      // Empty lines
      if (line.trim() === "") {
        flushParagraph()
        return
      }

      // Regular text - accumulate into paragraph
      currentParagraph.push(line)
    })

    // Flush any remaining content
    flushParagraph()
    flushTable()
    flushCodeBlock()

    return elements
  }

  const parseInlineFormatting = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = []
    let current = ""
    let i = 0

    while (i < text.length) {
      // Bold **text**
      if (text.slice(i, i + 2) === "**") {
        if (current) parts.push(current)
        current = ""
        const end = text.indexOf("**", i + 2)
        if (end !== -1) {
          parts.push(
            <strong key={i} className="font-semibold">
              {text.slice(i + 2, end)}
            </strong>
          )
          i = end + 2
          continue
        }
      }

      // Emoji handling - preserve them
      if (text[i].match(/[\u{1F000}-\u{1F9FF}]/u)) {
        if (current) parts.push(current)
        current = ""
        parts.push(
          <span key={i} className="text-base">
            {text[i]}
          </span>
        )
        i++
        continue
      }

      current += text[i]
      i++
    }

    if (current) parts.push(current)
    return parts.length > 0 ? parts : text
  }

  const renderTable = (rows: string[], key: number) => {
    const parseRow = (row: string) => {
      return row
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    }

    const headerRow = parseRow(rows[0])
    const isGarbageRow = (row: string) => {
      const cells = row
        .split("|")
        .slice(1, -1)
        .map(c => c.trim())
    
      // Remove rows where ALL cells:
      // - are empty OR
      // - contain only non-alphanumeric characters (----, ___, etc.)
      return cells.every(c => !/[a-zA-Z0-9]/.test(c))
    }
    
    const dataRows = rows
      .slice(1)
      .map(parseRow)
      .filter((cells) => {
        // Drop rows that contain NO meaningful data
        // (only dashes, empty, or repeated symbols)
        return cells.some(cell => /[a-zA-Z0-9]/.test(cell))
      })


    return (
      <div key={key} className="mb-4 overflow-x-auto">
        <table className="w-full border-collapse rounded-lg border border-border text-sm">
          <thead className="bg-accent/50">
            <tr>
              {headerRow.map((header, i) => (
                <th key={i} className="border-b border-border px-4 py-2 text-left font-semibold">
                  {parseInlineFormatting(header)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
          {dataRows.map((cells, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/30">
              {cells.map((cell, j) => (
                <td key={j} className="px-4 py-2">
                  {parseInlineFormatting(cell)}
                </td>
              ))}
            </tr>
          ))}

          </tbody>
        </table>
      </div>
    )
  }

  return <div className="markdown-content">{renderContent()}</div>
}

// ---------------- SMS Consent Checkbox ---------------- //

function SMSConsentCheckbox({ 
  onConsentChange, 
  phoneNumber 
}: { 
  onConsentChange: (consented: boolean) => void
  phoneNumber: string 
}) {
  const [checked, setChecked] = useState(false)

  const handleChange = (newChecked: boolean) => {
    setChecked(newChecked)
    onConsentChange(newChecked)
  }

  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-background/50 p-3">
      <Checkbox
        id={`sms-consent-${phoneNumber}`}
        checked={checked}
        onCheckedChange={handleChange}
        className="mt-0.5"
      />
      <label
        htmlFor={`sms-consent-${phoneNumber}`}
        className="cursor-pointer text-sm leading-relaxed text-foreground"
      >
        Yes, send me text updates. By checking this box, I agree to receive recurring automated promotional and personalized marketing text messages from Metropolitan Shuttle.
      </label>
    </div>
  )
}

// ---------------- MessageList ---------------- //

function MessageList({ 
  messages, 
  loading, 
  onSMSConsent 
}: { 
  messages: Message[]
  loading?: boolean
  onSMSConsent?: (consented: boolean, phoneNumber: string) => void
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [phoneNumberDetected, setPhoneNumberDetected] = useState<string | null>(null)
  const [assistantMessageIdForConsent, setAssistantMessageIdForConsent] = useState<string | null>(null)
  const [consentSubmitted, setConsentSubmitted] = useState(false)
  
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, loading])
  
  // Detect phone numbers and show checkbox immediately after phone number is shared
  useEffect(() => {
    // Find the most recent user message with a phone number
    let phoneNumberValue: string | null = null
    
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role === "user") {
        const phone = extractPhoneNumber(msg.content)
        if (phone) {
          phoneNumberValue = phone
          break
        }
      }
    }
    
    // Update detected phone number and reset consent
    if (phoneNumberValue && phoneNumberValue !== phoneNumberDetected) {
      setPhoneNumberDetected(phoneNumberValue)
      setConsentSubmitted(false)
      // Immediately find the most recent assistant message to show checkbox
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant" && messages[i].id !== "welcome") {
          setAssistantMessageIdForConsent(messages[i].id)
          break
        }
      }
    }
    
    // Keep updating to the latest assistant message if phone number is detected
    if (phoneNumberDetected && !consentSubmitted) {
      // Find the most recent assistant message
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "assistant" && messages[i].id !== "welcome") {
          if (messages[i].id !== assistantMessageIdForConsent) {
            setAssistantMessageIdForConsent(messages[i].id)
          }
          break
        }
      }
    }
  }, [messages, phoneNumberDetected, consentSubmitted, assistantMessageIdForConsent])
  
  const handleConsentChange = (consented: boolean) => {
    if (phoneNumberDetected && onSMSConsent && !consentSubmitted) {
      setConsentSubmitted(true)
      onSMSConsent(consented, phoneNumberDetected)
    }
  }
  
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => {
        const showConsentCheckbox = 
          m.role === "assistant" && 
          m.id === assistantMessageIdForConsent && 
          phoneNumberDetected && 
          !consentSubmitted
        
        return (
          <div key={m.id} className={cn("flex items-start gap-3", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "assistant" && (
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-accent text-accent-foreground">MS</AvatarFallback>
              </Avatar>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
            >
              {m.role === "assistant" ? <MarkdownRenderer content={m.content} /> : m.content}
              {showConsentCheckbox && (
                <SMSConsentCheckbox 
                  phoneNumber={phoneNumberDetected!} 
                  onConsentChange={handleConsentChange}
                />
              )}
            </div>
            {m.role === "user" && (
              <Avatar className="size-8 shrink-0">
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            )}
          </div>
        )
      })}
      {loading && (
        <div className="flex items-start gap-3 justify-start">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-accent text-accent-foreground">MS</AvatarFallback>
          </Avatar>
          <div className="max-w-[80%] rounded-lg bg-muted px-4 py-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-56" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

// ---------------- Mic Icon ---------------- //

function MicIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm6-3a6 6 0 1 1-12 0H4a8 8 0 0 0 7 7.938V22h2v-3.062A8 8 0 0 0 20 11h-2Z"
        fill="currentColor"
      />
    </svg>
  )
}

// ---------------- Chat Input ---------------- //

function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void
  disabled?: boolean
}) {
  const [text, setText] = useState("")

  const { supported, listening, interimTranscript, finalTranscript, start, stop, reset } =
    useSpeechRecognition({
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
    if (!listening && finalTranscript) {
      setText(finalTranscript.trim())
    }
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
          <button
            type="button"
            aria-label={listening ? "Stop recording" : "Start recording"}
            aria-pressed={listening}
            onClick={() => {
              if (!supported) {
                alert("Speech recognition is not supported in this browser.")
                return
              }
              if (listening) stop()
              else {
                reset()
                start()
              }
            }}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-primary transition-colors",
              listening ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
            )}
          >
            <span className="flex items-center gap-1">
              <MicIcon className={cn("size-5", listening && "opacity-90")} />
              {listening && <span className="text-xs font-medium">Listening</span>}
            </span>
          </button>
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
      {!supported && (
        <div className="text-xs text-muted-foreground">
          Your browser does not support speech recognition. Try Chrome.
        </div>
      )}
    </div>
  )
}

// ---------------- Quick Suggestions ---------------- //

function QuickSuggestions({
  mode,
  onPick,
  disabled,
}: {
  mode: "booking" | "retrieve"
  onPick: (text: string) => void
  disabled?: boolean
}) {
  const suggestions =
    mode === "booking"
      ? ["Book a ride from DC to NYC this Friday", "NYC to DC on Friday for 15 people one way leaving at 9am from Union station and arrive at 2pm at penn station"]
      : ["What's the price for a one-way trip from NYC to DC for 15 people?", "Who arranges and pays for the driver's hotel room?"]

  return (
    <div className="w-full">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Quick suggestions</div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((label) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onPick(label)}
            className="rounded-full border-primary/30 text-primary hover:bg-primary/10 hover:text-primary text-xs sm:text-xs"
          >
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
  const mode: "booking" = "booking"

  const invisibleContext = useMemo(() => {
    if (typeof window === "undefined") return ""
    const now = new Date()
    const locale = typeof navigator !== "undefined" ? navigator.language : "en-US"
    const timeString = now.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone?.replace(/_/g, " ")
    const locationDescription = timeZone ? `${timeZone}` : "an unknown location"
    return `Context (hidden from the user): The local time is ${timeString}, and the approximate location based on timezone is ${locationDescription}.`
  }, [])

  const triggerPhrases = [
    "let me look for pricing for similar trips",
    "our sales team will contact you soon to confirm final details",
    "checking pricing for similar trips",
    "finding price estimates",
  ]

  const handleSMSConsent = async (consented: boolean, phoneNumber: string) => {
    const consentText = consented ? "yes" : "no"
    await send(consentText)
  }

  const send = async (text: string) => {
    if (loading) return
    const userMsg: Message = { id: `${Date.now()}-u`, role: "user", content: text }
    
    // ✅ CRITICAL FIX: Build the full conversation history
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setLoading(true)

    const msgId = `${Date.now()}-a`

    try {
      const payload =
        hasSentFirstMessage || !invisibleContext
          ? text
          : `${invisibleContext}\n\n${text}`

      // 🚐 Booking Agent (Converse + tools)
      // ✅ CRITICAL FIX: Convert ALL messages to the format the backend expects
      const endpoint = "/api/bedrock-booking-agent";
      
      // Convert the full message history (excluding the welcome message)
      const conversationHistory = updatedMessages
        .filter(m => m.id !== "welcome") // Exclude welcome message
        .map(m => ({
          role: m.role,
          content: m.content
        }));
      
      const body = {
        messages: conversationHistory // Send FULL history
      };
      
      console.log("📤 Sending to backend:", JSON.stringify(body, null, 2));

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error")
        throw new Error(`Request failed: ${res.status} - ${errorText}`)
      }
      
      if (!res.body) {
        throw new Error("No response body received from server")
      }
      
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ""

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          if (value) {
            const chunk = decoder.decode(value, { stream: true })
            fullText += chunk
            setMessages((prev) => {
              const hasMsg = prev.some((m) => m.id === msgId)
              if (!hasMsg) {
                return [...prev, { id: msgId, role: "assistant", content: chunk }]
              }
              return prev.map((m) =>
                m.id === msgId ? { ...m, content: fullText } : m,
              )
            })
          }
        }

        fullText = sanitizeAssistantOutput(fullText)
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, content: fullText } : m)),
        )
      } catch (streamError) {
        // If we got some text before the stream error, use it
        if (fullText.trim()) {
          fullText = sanitizeAssistantOutput(fullText)
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, content: fullText } : m)),
          )
        } else {
          throw streamError
        }
      }

      // Commented out pricing check after booking save
        // const normalizedText = normalizeText(fullText)
        // const containsTrigger = triggerPhrases.some((phrase) =>
        //   normalizedText.includes(normalizeText(phrase)),
        // )
        // if (containsTrigger) {
        //   // Pricing follow-up logic would go here
        // }
    } catch (e) {
      console.error("❌ Chat error:", e)
      
      // Determine error type and show appropriate message
      let errorMessage = "I'm having trouble connecting right now. Please try again in a moment."
      
      if (e instanceof TypeError && e.message.includes("fetch")) {
        errorMessage = "I'm having trouble connecting to the server. Please check your internet connection and try again."
      } else if (e instanceof Error) {
        if (e.message.includes("404") || e.message.includes("Not Found")) {
          errorMessage = "The service is temporarily unavailable. Please try again in a moment."
        } else if (e.message.includes("500") || e.message.includes("Internal Server Error")) {
          errorMessage = "Something went wrong on our end. Please try again, and if the problem persists, contact support."
        } else if (e.message.includes("timeout") || e.message.includes("Timeout")) {
          errorMessage = "The request took too long. Please try again."
        } else if (e.message.includes("Failed to fetch")) {
          errorMessage = "Unable to connect. Please check your connection and try again."
        }
      }
      
      setMessages((m) => [
        ...m,
        {
          id: `${Date.now()}-e`,
          role: "assistant",
          content: errorMessage,
        },
      ])
    } finally {
      setLoading(false)
      if (!hasSentFirstMessage) setHasSentFirstMessage(true)
    }
  }

  return (
    <main className="flex h-[100dvh] flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-background px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <img src="/images/logo.svg" alt="Metropolitan Shuttle" className="h-6 w-auto" />
          <span className="sr-only">Metropolitan Shuttle</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-muted-foreground capitalize">
            Shuttle Booking Mode
          </div>
        </div>
      </header>

      {/* Body */}
      <section className="flex-1 bg-secondary">
        <div className="mx-auto flex h-full max-w-4xl flex-col px-4 py-6 md:px-6 md:py-8">
          <h1 className="text-pretty text-xl font-semibold text-foreground md:text-2xl">
            Shuttle Booking Assistant
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Let us help you book your shuttle!
          </p>

          <div className="mt-6 flex-1 overflow-y-auto">
            <MessageList messages={messages} loading={loading} onSMSConsent={handleSMSConsent} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6 md:py-7">
          <div className="mb-3 md:mb-4">
            <QuickSuggestions mode="booking" onPick={(t) => send(t)} disabled={loading} />
          </div>
          <div className="pb-6 md:pb-6">
            <ChatInput onSend={send} disabled={loading} />
          </div>
        </div>
      </footer>
    </main>
  )
}