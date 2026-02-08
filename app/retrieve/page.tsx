"use client"

import { cn } from "@/lib/utils"
import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
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

      // Table detection - be more lenient: if line starts with |, treat it as table row
      // This handles cases where markdown links or long URLs might break the row format
      if (line.trim().startsWith("|")) {
        flushParagraph()
        inTable = true
        // If row doesn't end with |, it might be a continuation or broken link - still include it
        // We'll handle incomplete rows in the renderTable function
        tableRows.push(line)
        return
      } else if (inTable) {
        // Check if this line is a continuation of the previous table row (e.g., broken markdown link)
        // If it looks like it might be part of a URL or link continuation, append to last row
        const lastRow = tableRows[tableRows.length - 1]
        if (lastRow && (
          line.trim().startsWith("(") || // URL continuation like "(https://..."
          line.trim().match(/^https?:\/\//) || // Direct URL
          (lastRow.includes("[") && !lastRow.includes("](")) // Incomplete markdown link
        )) {
          // This looks like a continuation - append to last row
          tableRows[tableRows.length - 1] = lastRow + " " + line.trim()
          return
        }
        // Table ended - flush it and continue processing this line as regular content
        flushTable()
        // Don't return - let this line be processed as regular text/paragraph
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
      // Markdown links: [label](url)
      if (text[i] === "[") {
        const closeBracket = text.indexOf("]", i + 1)
        const openParen = closeBracket !== -1 ? text.indexOf("(", closeBracket + 1) : -1
        const closeParen = openParen !== -1 ? text.indexOf(")", openParen + 1) : -1

        if (closeBracket !== -1 && openParen === closeBracket + 1 && closeParen !== -1) {
          const label = text.slice(i + 1, closeBracket)
          const url = text.slice(openParen + 1, closeParen).trim()
          const isSafeUrl = /^https?:\/\//i.test(url)

          if (isSafeUrl) {
            if (current) parts.push(current)
            current = ""
            parts.push(
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2 hover:opacity-90"
              >
                {label}
              </a>,
            )
            i = closeParen + 1
            continue
          }
        }
      }

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
      // Handle rows that might not end with | (e.g., broken markdown links)
      let normalizedRow = row.trim()
      const cells = normalizedRow.split("|")
      // Remove first empty element (before first |) and last empty element (after last |)
      // But if row doesn't end with |, last element might have content
      if (normalizedRow.endsWith("|")) {
        return cells.slice(1, -1).map((cell) => cell.trim())
      } else {
        // Row doesn't end with | - take everything after first |, including the last cell
        return cells.slice(1).map((cell) => cell.trim())
      }
    }

    const headerRow = parseRow(rows[0])
    
    // Markdown separator rows have multiple cells of hyphens/spaces/colons (e.g. | ----- | ----- |)
    const isSeparator = (cells: string[]) => {
      return cells.length > 0 && cells.every((cell) => /^[\s\-:]+$/.test(cell))
    }
    
    const routeColIndex = headerRow.findIndex(
      (h) => String(h).toLowerCase().replace(/\s+/g, "") === "route"
    )
    
    // Treat route as empty if cell is blank, "-", or destination is missing (e.g. "-> -" or "X -> -")
    const hasEmptyRoute = (cells: string[]) => {
      if (routeColIndex === -1) return false
      const route = (cells[routeColIndex] ?? "").trim()
      if (!route || route === "-") return true
      if (/->\s*-\s*$/.test(route)) return true // "-> -" or "Newark Airport -> -"
      return false
    }
    
    // Parse all rows first, then filter
    const parsedRows = rows.slice(1).map(parseRow)
    
    // Filter out separator rows and rows with empty routes
    const dataRows = parsedRows.filter((cells) => {
      // Remove separator rows
      if (isSeparator(cells)) return false
      // Remove rows with no meaningful data
      if (!cells.some(cell => /[a-zA-Z0-9]/.test(cell))) return false
      // Remove rows with empty routes
      if (hasEmptyRoute(cells)) return false
      return true
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
            {dataRows.map((cells, i) => {
              // Ensure data row has same number of columns as header (pad with empty cells if needed)
              const paddedCells = [...cells]
              while (paddedCells.length < headerRow.length) {
                paddedCells.push("")
              }
              // Truncate if somehow more cells than headers
              const finalCells = paddedCells.slice(0, headerRow.length)
              
              return (
                <tr key={i} className="border-b border-border last:border-0 hover:bg-accent/30">
                  {finalCells.map((cell, j) => (
                    <td key={j} className="px-4 py-2">
                      {parseInlineFormatting(cell)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return <div className="markdown-content">{renderContent()}</div>
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
          </div>
          {m.role === "user" && (
            <Avatar className="size-8 shrink-0">
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
          )}
        </div>
      ))}
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

  const { supported, listening, error, interimTranscript, finalTranscript, start, stop, reset } =
    useSpeechRecognition({
      lang: "en-US",
      continuous: true,
      interimResults: true,
    })

  useEffect(() => {
    const combined = (finalTranscript + (interimTranscript ? " " + interimTranscript : "")).trim()
    if (combined) setText(combined)
  }, [finalTranscript, interimTranscript])

  const errorMessage =
    error === "network"
      ? "Speech recognition needs internet. Check your connection and try again."
      : error === "not-allowed" || error === "service-not-allowed"
        ? "Microphone access was denied. Allow the mic and try again."
        : error === "no-speech"
          ? "No speech detected. Tap the mic and speak again."
          : error
            ? `Speech error: ${error}. Tap the mic to try again.`
            : null

  return (
    <div className="flex flex-col gap-2">
      {errorMessage && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{errorMessage}</p>
      )}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            aria-label="Message"
            placeholder="Ask about past bookings or trip details"
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
  onPick,
  disabled,
}: {
  onPick: (text: string) => void
  disabled?: boolean
}) {
  const suggestions = [
    "What's the price for a one-way trip from NYC to DC for 15 people?",
    "Who arranges and pays for the driver's hotel room?",
  ]

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

// ---------------- Main Retrieve Page ---------------- //

export default function RetrievePage() {
  const [sessionId] = useState(createSessionId)
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "assistant", content: "Welcome to Trip Retrieval! Ask me about past bookings or trip details." },
  ])
  const [loading, setLoading] = useState(false)
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false)
  const mode: "retrieve" = "retrieve"

  const invisibleContext = useMemo(() => {
    if (typeof window === "undefined") return ""
    const now = new Date()
    const locale = typeof navigator !== "undefined" ? navigator.language : "en-US"
    const timeString = now.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone?.replace(/_/g, " ")
    const locationDescription = timeZone ? `${timeZone}` : "an unknown location"
    return `Context (hidden from the user): The local time is ${timeString}, and the approximate location based on timezone is ${locationDescription}.

Table Formatting (hidden from the user): When presenting historical trips in a markdown table, use this EXACT column order: Trip Date | Route | Passengers | Trip Type | Fare | Distance Match | Opportunity. The Opportunity column must be last and format each Opportunity ID as: [OPPORTUNITY_ID](https://mshuttle.lightning.force.com/lightning/r/Opportunity/OPPORTUNITY_ID/view). If Opportunity ID is missing, display "-". Ensure Route column is never empty - use city fields as fallback if address is missing.`
  }, [])

  const triggerPhrases = [
    "let me look for pricing for similar trips",
    "our sales team will contact you soon to confirm final details",
    "checking pricing for similar trips",
    "finding price estimates",
  ]

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

      // 🔎 Retrieval Agent
      const endpoint = "/api/bedrock-agent"
      const body = {
        input: payload,
        sessionId,
        mode
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
          const hasMsg = prev.some((m) => m.id === msgId)
          if (!hasMsg) {
            return [...prev, { id: msgId, role: "assistant", content: chunk }]
          }
          return prev.map((m) =>
            m.id === msgId ? { ...m, content: fullText } : m,
          )
        })
      }

      fullText = sanitizeAssistantOutput(fullText)
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, content: fullText } : m)),
      )

      const normalizedText = normalizeText(fullText)
      const containsTrigger = triggerPhrases.some((phrase) =>
        normalizedText.includes(normalizeText(phrase)),
      )

      if (containsTrigger) {
        const followUpRes = await fetch("/api/bedrock-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: "What is the estimated price for this trip?",
            sessionId,
            mode,
          }),
        })

        if (followUpRes.ok) {
          const followUpData = sanitizeAssistantOutput(await followUpRes.text())
          setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-f`, role: "assistant", content: followUpData },
          ])
        }
      }
    } catch (e) {
      console.error("❌ Chat error:", e)
      setMessages((m) => [
        ...m,
        {
          id: `${Date.now()}-e`,
          role: "assistant",
          content:
            "Sorry, I couldn't reach the agent. Verify env vars and AWS configuration.",
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
            Retrieve Mode
          </div>
        </div>
      </header>

      {/* Body */}
      <section className="flex-1 bg-secondary">
        <div className="mx-auto flex h-full max-w-4xl flex-col px-4 py-6 md:px-6 md:py-8">
          <h1 className="text-pretty text-xl font-semibold text-foreground md:text-2xl">
            Trip Retrieval Assistant
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask about past bookings or trip details.
          </p>

          <div className="mt-6 flex-1 overflow-y-auto">
            <MessageList messages={messages} loading={loading} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-6 md:py-7">
          <div className="mb-3 md:mb-4">
            <QuickSuggestions onPick={(t) => send(t)} disabled={loading} />
          </div>
          <div className="pb-6 md:pb-6">
            <ChatInput onSend={send} disabled={loading} />
          </div>
        </div>
      </footer>
    </main>
  )
}

