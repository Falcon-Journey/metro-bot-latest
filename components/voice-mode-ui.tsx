"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import Image from "next/image"
import { MicIcon, Volume2Icon, StampIcon as StopIcon, MessageSquareIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import logo from "@/public/images/logo.svg"
import { AudioPlayer, AudioProcessor, base64ToFloat32Array } from "@/lib/audio-utils"
import { NovaSonicSocketClient } from "@/lib/nova-sonic-client"
import {
  AIInputModelSelect,
  AIInputModelSelectContent,
  AIInputModelSelectItem,
  AIInputModelSelectTrigger,
  AIInputModelSelectValue,
  AIInputToolbar,
  AIInputTools,
} from "@/components/ui/kibo-ui/ai/input"
import { Switch } from "@radix-ui/react-switch"

interface VoiceModeUIProps {
  handleSuggestionClick: (suggestion: string) => void
  suggestions: string[]
  isVoiceMode: boolean
  setIsVoiceMode: React.Dispatch<React.SetStateAction<boolean>>
  // model: string
  // setModel: React.Dispatch<React.SetStateAction<string>>
  // models: { id: string; name: string; provider: string }[]
}

export default function VoiceModeUI({
  isVoiceMode,
  setIsVoiceMode,
  // model,
  // setModel,
  // models,
}: VoiceModeUIProps) {
  const [active, setActive] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [status, setStatus] = useState("Initializing...")
  const [isConnected, setIsConnected] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const audioProcessorRef = useRef<AudioProcessor | null>(null)
  const audioPlayerRef = useRef<AudioPlayer | null>(null)
  const novaSonicClientRef = useRef<NovaSonicSocketClient | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  const [agentType, setAgentType] = useState<"retrieval" | "booking">("retrieval")


  useEffect(() => {
        setIsVoiceMode(true);
    const initializeAudio = async () => {
      try {
        setStatus("Requesting microphone access...")
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 24000,
          },
        })

        audioProcessorRef.current = new AudioProcessor()
        await audioProcessorRef.current.initAudio()

        audioPlayerRef.current = new AudioPlayer()
        await audioPlayerRef.current.start()

        novaSonicClientRef.current = new NovaSonicSocketClient()

        novaSonicClientRef.current.on("connect", () => {
          setIsConnected(true)
          setStatus("Connected to Nova Sonic")
        })

        novaSonicClientRef.current.on("disconnect", () => {
          setIsConnected(false)
          setStatus("Disconnected")
          setActive(false)
          setIsSpeaking(false)
        })

        novaSonicClientRef.current.on("textOutput", (data) => {
          if (data.content) setTranscript(data.content)
        })

        novaSonicClientRef.current.on("audioOutput", (data) => {
          if (data.content) {
            try {
              setIsSpeaking(true)
              const audioData = base64ToFloat32Array(data.content)
              audioPlayerRef.current?.streamPCMData(audioData, 24000)
            } catch (err) {
              console.error("Error playing audio chunk:", err)
              setIsSpeaking(false)
            }
          }
        })

        novaSonicClientRef.current.on("streamComplete", () => {
          setActive(false)
          setTimeout(() => setIsSpeaking(false), 500)
          setStatus("Ready")
        })

        novaSonicClientRef.current.on("error", (err) => {
          console.error("Nova Sonic error:", err)
          setStatus("Error: " + (err.message || "Unknown error"))
          setActive(false)
          setIsSpeaking(false)
        })

        setStatus("Ready to start voice session")
      } catch (err) {
        console.error("Error initializing audio:", err)
        setStatus("Error: " + (err instanceof Error ? err.message : "Microphone access denied"))
      }
    }

    initializeAudio()

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      audioProcessorRef.current?.cleanup()
      audioPlayerRef.current?.destroy()
      novaSonicClientRef.current?.disconnect()
    }
  }, [])

  const handleMicClick = async () => {
    if (!novaSonicClientRef.current || !audioProcessorRef.current || !mediaStreamRef.current) {
      setStatus("Audio not initialized")
      return
    }

    if (active) {
      setActive(false)
      setStatus("Processing...")
      audioProcessorRef.current.stopStreaming()
      novaSonicClientRef.current.stopAudio()
    } else {
      try {
        setStatus("Starting session...")
        await novaSonicClientRef.current.initializeSession({ agentType })

        await audioProcessorRef.current.startStreaming((base64Data) => {
          novaSonicClientRef.current?.sendAudioInput(base64Data)
        }, mediaStreamRef.current)

        setActive(true)
        setStatus("Listening... Speak now")
        setTranscript("")
      } catch (err) {
        console.error("Error starting voice session:", err)
        setStatus("Error: " + (err instanceof Error ? err.message : "Unknown error"))
        setActive(false)
      }
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-4 min-h-0">
        {/* Avatar + status */}
        <div className="relative flex flex-col items-center space-y-4">
          <div
            className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-500 ${
              isSpeaking
                ? "bg-gradient-to-br from-green-400 to-emerald-600 scale-105 shadow-2xl shadow-green-500/30"
                : active
                  ? "bg-gradient-to-br from-[#8fbc8f] to-[#2d5a5a] scale-100 shadow-xl"
                  : "bg-gradient-to-br from-gray-400 to-gray-600 scale-95"
            }`}
          >
            {isSpeaking ? (
              <Volume2Icon className="w-12 h-12 text-white animate-pulse" />
            ) : active ? (
              <MicIcon className="w-12 h-12 text-white animate-pulse" />
            ) : (
              <Image
                src={logo || "/placeholder.svg"}
                alt="Logo"
                className={`w-12 h-12 text-white ${isConnected ? "animate-pulse" : ""}`}
              />
            )}
          </div>

          <h2 className="text-2xl font-semibold">
            {isSpeaking ? "🎙️ I'm responding..." : active ? "👂 I'm listening..." : "💚 Voice Wellness Mode"}
          </h2>
          <p className="text-sm text-gray-600">{status}</p>
        </div>

        {/* Mic control */}
        <Button
          onClick={handleMicClick}
          size="lg"
          disabled={!isConnected}
          className={`w-16 h-16 rounded-full transition-all duration-300 text-lg font-semibold ${
            isSpeaking
              ? "bg-gray-400 cursor-not-allowed scale-95"
              : active
                ? "bg-red-500 hover:bg-red-600 scale-100"
                : "bg-[#2d5a5a] hover:bg-[#1e3a3a] scale-100"
          }`}
        >
          {active ? <StopIcon className="w-6 h-6 text-white" /> : <MicIcon className="w-6 h-6 text-white" />}
        </Button>

        {/* Transcript */}
        {transcript && (
          <div className="w-full max-w-md bg-gray-50 p-4 rounded-lg text-sm">
            <p className="font-medium text-gray-700 mb-2">Transcript:</p>
            <p className="whitespace-pre-wrap text-gray-600">{transcript}</p>
          </div>
        )}

{/* Toolbar (toggle back to text mode + model select) */}
<AIInputToolbar>
  <AIInputTools>
    <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-white/50">
<MessageSquareIcon
  onClick={() => setIsVoiceMode(false)}
  className={`w-4 h-4 cursor-pointer transition-colors ${
    !isVoiceMode ? "text-[#2d5a5a]" : "text-gray-400"
  }`}
/>

      <MicIcon
        className={`w-4 h-4 transition-colors ${isVoiceMode ? "text-[#2d5a5a]" : "text-gray-400"}`}
      />
      <span className="text-sm font-medium text-[#2d5a5a]">
        {isVoiceMode ? "Voice" : "Text"}
      </span>
    </div>

    <AIInputModelSelect onValueChange={(val) => setAgentType(val as "retrieval" | "booking")} value={agentType}>
      <AIInputModelSelectTrigger className="text-[#2d5a5a]">
        <AIInputModelSelectValue placeholder="Select agent type" />
      </AIInputModelSelectTrigger>
      <AIInputModelSelectContent>
        <AIInputModelSelectItem value="retrieval">Retrieval Agent</AIInputModelSelectItem>
        <AIInputModelSelectItem value="booking">Booking Agent</AIInputModelSelectItem>
      </AIInputModelSelectContent>
    </AIInputModelSelect>

  </AIInputTools>
</AIInputToolbar>
    {/* <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-white/50">
      <span className="text-sm font-medium text-[#2d5a5a]">Agent:</span>
      <select
        value={agentType}
        onChange={(e) => setAgentType(e.target.value as "retrieval" | "booking")}
        className="bg-transparent border-none outline-none text-[#2d5a5a] font-medium cursor-pointer"
      >
        <option value="retrieval">Retrieval</option>
        <option value="booking">Booking</option>
      </select>
    </div> */}
        
      </div>
    </div>
  )
}
