"use client"

import { cn } from "@/lib/utils"
import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { useSpeechRecognition } from "@/hooks/use-speech-recognition"

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
    .replace(/[.,!?…]/g, "") // remove punctuation
    .replace(/\s+/g, " ")     // collapse spaces
    .trim()
}

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

function ChatInput({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void
  disabled?: boolean
}) {
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
                  stop() // stop dictation on send
                }
              }
            }}
            className="pr-12" // extra space for mic and better padding
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
              if (listening) {
                stop()
              } else {
                reset() // clear previous transcripts before new session
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
            stop() // stop dictation on send
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

function QuickSuggestions({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void
  disabled?: boolean
}) {
  const bookingItems = [
    "Book a ride from DC to NYC this Friday",
    "What is your payment policy?",
  ]
  return (
    <div className="w-full">
      <div className="mb-2 text-xs font-medium text-muted-foreground">Quick suggestions</div>
      <div className="flex flex-wrap gap-2">
        {bookingItems.map((label) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onPick(label)}
            className="rounded-full border-primary/30 text-primary hover:bg-primary/10"
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  )
}

function sanitizeAssistantOutput(text: string) {
  return text.replace(/<\/sources>/gi, "")
}

export default function ChatPage() {
  const [sessionId] = useState(createSessionId)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Welcome to Metropolitan Shuttle! Where would you like to go today?",
    },
  ])
  const [loading, setLoading] = useState(false)
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false)

  const invisibleContext = useMemo(() => {
    if (typeof window === "undefined") {
      return ""
    }
    const now = new Date()
    const locale = typeof navigator !== "undefined" ? navigator.language : "en-US"
    const timeString = now.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" })
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone?.replace(/_/g, " ")
    const locationDescription = timeZone ? `${timeZone}` : "an unknown location"
    return `Context (hidden from the user): The local time is ${timeString}, and the approximate location based on timezone is ${locationDescription}.`
  }, [])

  const mode = "booking" as const

  const triggerPhrases = [
  "let me look for pricing for similar trips",
  "Our sales team will contact you soon to confirm final details",
  "checking pricing for similar trips",
  "finding price estimates",
];

const send = async (text: string) => {
  if (loading) return;
  const userMsg: Message = { id: `${Date.now()}-u`, role: "user", content: text };
  setMessages((m) => [...m, userMsg]);
  setLoading(true);

  try {
    const payload = hasSentFirstMessage || !invisibleContext
      ? text
      : `${invisibleContext}\n\n${text}`;

    const res = await fetch("/api/bedrock-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: payload, sessionId, mode }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `Request failed: ${res.status}`);
    }

    const data = (await res.json()) as { output: string };
    let fullText = sanitizeAssistantOutput(data.output || "(No response)");

    const msgId = `${Date.now()}-a`;
    setMessages((m) => [...m, { id: msgId, role: "assistant", content: "" }]);

    // Check if the response contains a trigger phrase
    const normalizedText = normalizeText(fullText)
    const containsTrigger = triggerPhrases.some((phrase) =>
      normalizedText.includes(normalizeText(phrase))
    )

    if (containsTrigger) {
      // Send follow-up question
      try {
        const followUpRes = await fetch("/api/bedrock-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: "What is the estimated price for this trip?",
            sessionId,
            mode,
          }),
        });
        if (followUpRes.ok) {
          const followUpData = await followUpRes.json() as { output: string };
          fullText = sanitizeAssistantOutput(followUpData.output || "(No response)");
        }
      } catch (err) {
        console.error("❌ Follow-up agent call failed:", err);
        fullText = "(Could not fetch estimated price.)";
      }
    }

    // Gradually reveal text
    let index = 0;
    const step = 5;        // reveal 5 chars per frame
    const delay = 10;      // every 10 ms

    const interval = setInterval(() => {
      index += step;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, content: fullText.slice(0, index) } : m
        )
      );
      if (index >= fullText.length) clearInterval(interval);
    }, delay);

  } catch (e: any) {
    const assistantMsg: Message = {
      id: `${Date.now()}-e`,
      role: "assistant",
      content:
        "Sorry, I couldn’t reach the agent. Verify env vars for the selected mode and that the AWS Agents and Aliases are correct.",
    };
    setMessages((m) => [...m, assistantMsg]);
  } finally {
    setLoading(false);
  }

  if (!hasSentFirstMessage) setHasSentFirstMessage(true);
};


  return (
    <main className="flex h-[100dvh] flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b bg-background px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <img src="/images/logo.svg" alt="Metropolitan Shuttle" className="h-6 w-auto" />
          <span className="sr-only">Metropolitan Shuttle</span>
        </div>
        <div className="text-sm font-medium text-muted-foreground">Shuttle Booking Mode</div>
      </header>

      <section className="flex-1 bg-secondary">
        <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-6 md:px-6 md:py-8">
          <h1 className="text-pretty text-xl font-semibold text-foreground md:text-2xl">Shuttle Booking Assistant</h1>
          <p className="mt-1 text-sm text-muted-foreground">Let us help you book your shuttle!</p>

          {/* Scrollable messages */}
          <div className="mt-6 flex-1 overflow-y-auto">
            <MessageList messages={messages} loading={loading} />
          </div>
        </div>
      </section>

      {/* Bottom area: suggestions + input with comfortable bottom padding */}
      <footer className="border-t bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6 md:py-7">
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
