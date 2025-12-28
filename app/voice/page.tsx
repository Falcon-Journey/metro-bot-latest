"use client"

import { useState } from "react"
import VoiceModeUI from "@/components/voice-mode-ui"

export default function VoicePage() {
  const [isVoiceMode, setIsVoiceMode] = useState(true)
  const mode: "booking" = "booking"

  // Example suggestions
  const suggestions = [
    "Book a ride from DC to NYC this Friday",
    "What’s the price for a one-way trip from NYC to DC?",
  ]

  const handleSuggestionClick = (suggestion: string) => {
    console.log("User clicked:", suggestion)
    // you can trigger your logic here (e.g., send to API)
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
      <VoiceModeUI
        handleSuggestionClick={handleSuggestionClick}
        suggestions={suggestions}
        isVoiceMode={isVoiceMode}
        setIsVoiceMode={setIsVoiceMode}
      />
      <footer className="border-t bg-background">
      </footer>
    </main>
  )
}
