import { io, type Socket } from "socket.io-client"

export interface NovaSocketEvents {
  contentStart: (data: any) => void
  textOutput: (data: any) => void
  audioOutput: (data: any) => void
  contentEnd: (data: any) => void
  streamComplete: () => void
  error: (error: any) => void
  connect: () => void
  disconnect: () => void
}

export class NovaSonicSocketClient {
  private socket: Socket | null = null
  private sessionInitialized = false
  private selectedUserId = ""
  private selectedVoiceId = "tiffany"
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  private agentType: "retrieval" | "booking" = "retrieval"

  constructor() {
    this.initSocket()
  }

  private initSocket(): void {
    this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:8080", {
      transports: ["websocket", "polling"],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      forceNew: true,
    })

    if (this.socket) {
      this.socket.on("connect", () => {
        console.log("Nova Sonic socket connected")
        this.sessionInitialized = false
        this.reconnectAttempts = 0
      })

      this.socket.on("disconnect", (reason) => {
        console.log("Nova Sonic socket disconnected:", reason)
        this.sessionInitialized = false
      })

      this.socket.on("connect_error", (error) => {
        console.error("Nova Sonic connection error:", error)
        this.reconnectAttempts++
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error("Max reconnection attempts reached")
        }
      })

      this.socket.on("reconnect", (attemptNumber) => {
        console.log("Nova Sonic reconnected after", attemptNumber, "attempts")
        this.reconnectAttempts = 0
      })
    }
  }

  async initializeSession(options?: { agentType?: "retrieval" | "booking" }): Promise<void> {
    if (this.sessionInitialized) return
    if (!this.socket) throw new Error("Socket not initialized")
    if (!this.socket.connected) {
      throw new Error("Socket not connected")
    }

    if (options?.agentType) this.agentType = options.agentType


    try {
      if (this.selectedUserId) {
        this.socket.emit("setUserId", { user_id: this.selectedUserId })
      }

      if (this.selectedVoiceId) {
        this.socket.emit("setVoice", { voiceId: this.selectedVoiceId })
      }
      this.socket.emit("setAgentType", { agentType: this.agentType })

      this.socket.emit("promptStart")
      this.socket.emit("systemPrompt")
      this.socket.emit("audioStart")

      this.sessionInitialized = true
      console.log("Nova Sonic session initialized")
    } catch (error) {
      console.error("Error initializing Nova Sonic session:", error)
      throw error
    }
  }

  sendAudioInput(base64Data: string): void {
    if (!this.socket || !this.sessionInitialized || !this.socket.connected) {
      console.warn("Cannot send audio: socket not ready")
      return
    }

    try {
      this.socket.emit("audioInput", base64Data)
    } catch (error) {
      console.error("Error sending audio input:", error)
    }
  }

  stopAudio(): void {
    if (!this.socket) return

    try {
      this.socket.emit("stopAudio")
      console.log("Audio stopped")
    } catch (error) {
      console.error("Error stopping audio:", error)
    }
  }

  setUserId(userId: string): void {
    this.selectedUserId = userId
    if (this.socket && this.socket.connected) {
      this.socket.emit("setUserId", { user_id: userId })
    }
  }

  setVoiceId(voiceId: string): void {
    this.selectedVoiceId = voiceId
    if (this.socket && this.socket.connected) {
      this.socket.emit("setVoice", { voiceId })
    }
  }

  on<K extends keyof NovaSocketEvents>(event: K, handler: NovaSocketEvents[K]): void {
    if (!this.socket) return
    this.socket.on(event as string, handler as (...args: any[]) => void)
  }

  off<K extends keyof NovaSocketEvents>(event: K, handler?: NovaSocketEvents[K]): void {
    if (!this.socket) return
    if (handler) {
      this.socket.off(event as string, handler as (...args: any[]) => void)
    } else {
      this.socket.off(event as string)
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
    this.sessionInitialized = false
    console.log("Nova Sonic client disconnected")
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false
  }

  isSessionReady(): boolean {
    return this.sessionInitialized && this.isConnected()
  }

  reconnect(): void {
    if (this.socket) {
      this.socket.connect()
    } else {
      this.initSocket()
    }
  }
}
