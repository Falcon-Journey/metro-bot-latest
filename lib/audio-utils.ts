export function base64ToFloat32Array(base64String: string): Float32Array {
  try {
    const binaryString = window.atob(base64String)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const int16Array = new Int16Array(bytes.buffer)
    const float32Array = new Float32Array(int16Array.length)
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768
    }
    return float32Array
  } catch (error) {
    console.error("Error converting base64 to Float32Array:", error)
    return new Float32Array(0)
  }
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null
  private _initialized = false
  private isPlaying = false
  private gainNode: GainNode | null = null
  private audioQueue: { data: Float32Array; sampleRate: number }[] = []
  private isProcessingQueue = false
  private nextStartTime = 0
  private currentPlaybackTime = 0

  get initialized() {
    return this._initialized
  }

  async start() {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 24000,
          latencyHint: "interactive",
        })
        this.gainNode = this.audioContext.createGain()
        this.gainNode.gain.value = 0.8 // Slightly lower volume to prevent distortion
        this.gainNode.connect(this.audioContext.destination)
      }
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume()
      }
      this._initialized = true
    } catch (error) {
      console.error("Error starting AudioPlayer:", error)
      throw error
    }
  }

  async resume() {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume()
    }
  }

  async playAudioFromArrayBuffer(buffer: ArrayBuffer) {
    if (!this.audioContext || !this.gainNode) {
      throw new Error("AudioContext not initialized")
    }

    try {
      this.stop()

      const audioBuffer = await this.audioContext.decodeAudioData(buffer.slice(0))
      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.gainNode)

      source.onended = () => {
        this.isPlaying = false
        this.currentSource = null
      }

      source.start()
      this.currentSource = source
      this.isPlaying = true
    } catch (error) {
      console.error("Error playing audio:", error)
      this.isPlaying = false
      this.currentSource = null
      throw error
    }
  }

  async streamPCMData(float32Array: Float32Array, sampleRate = 24000) {
    if (!this.audioContext || !this.gainNode) {
      throw new Error("AudioContext not initialized")
    }

    this.audioQueue.push({ data: new Float32Array(float32Array), sampleRate })

    // Start processing queue if not already processing
    if (!this.isProcessingQueue) {
      this.processAudioQueue()
    }
  }

  private async processAudioQueue() {
    if (!this.audioContext || !this.gainNode) return

    this.isProcessingQueue = true

    if (this.nextStartTime === 0) {
      this.nextStartTime = this.audioContext.currentTime + 0.1 // Small delay to prevent glitches
    }

    while (this.audioQueue.length > 0) {
      const { data, sampleRate } = this.audioQueue.shift()!

      try {
        const audioBuffer = this.audioContext.createBuffer(1, data.length, sampleRate)
        audioBuffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0)

        const source = this.audioContext.createBufferSource()
        source.buffer = audioBuffer
        source.connect(this.gainNode)

        const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime)
        source.start(startTime)

        // Calculate next start time for seamless playback
        this.nextStartTime = startTime + audioBuffer.duration
        this.currentPlaybackTime = this.nextStartTime

        this.isPlaying = true
      } catch (error) {
        console.error("Error playing audio chunk:", error)
      }

      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    this.isProcessingQueue = false
  }

  stop() {
    if (this.currentSource && this.isPlaying) {
      try {
        this.currentSource.stop()
      } catch (error) {
        // Ignore errors when stopping already stopped sources
      }
      this.currentSource = null
    }

    // Clear queue and reset timing
    this.audioQueue = []
    this.nextStartTime = 0
    this.currentPlaybackTime = 0
    this.isPlaying = false
    this.isProcessingQueue = false
  }

  setVolume(volume: number) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume))
    }
  }

  destroy() {
    this.stop()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    this.gainNode = null
    this._initialized = false
  }
}

export class AudioProcessor {
  private audioContext: AudioContext | null = null
  private processorNode: ScriptProcessorNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private isStreaming = false

  async initAudio() {
    try {
      this.audioContext = new AudioContext({
        sampleRate: 24000,
        latencyHint: "interactive",
      })

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume()
      }
    } catch (error) {
      console.error("Error initializing audio context:", error)
      throw error
    }
  }

  async startStreaming(onAudioChunk: (base64Data: string) => void, stream: MediaStream) {
    if (!this.audioContext) throw new Error("AudioContext not initialized")

    try {
      this.isStreaming = true

      this.sourceNode = this.audioContext.createMediaStreamSource(stream)

      this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1)

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isStreaming) return

        try {
          const inputData = e.inputBuffer.getChannelData(0)
          const pcmData = new Int16Array(inputData.length)

          for (let i = 0; i < inputData.length; i++) {
            const sample = Math.max(-1, Math.min(1, inputData[i]))
            pcmData[i] = sample * 0x7fff
          }

          const uint8Array = new Uint8Array(pcmData.buffer)
          let binary = ""
          const chunkSize = 8192
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + chunkSize)))
          }
          const base64 = btoa(binary)
          onAudioChunk(base64)
        } catch (error) {
          console.error("Error processing audio chunk:", error)
        }
      }

      this.sourceNode.connect(this.processorNode)
      this.processorNode.connect(this.audioContext.destination)
    } catch (error) {
      console.error("Error starting audio streaming:", error)
      this.isStreaming = false
      throw error
    }
  }

  stopStreaming() {
    this.isStreaming = false

    try {
      if (this.processorNode) {
        this.processorNode.disconnect()
        this.processorNode = null
      }
      if (this.sourceNode) {
        this.sourceNode.disconnect()
        this.sourceNode = null
      }
    } catch (error) {
      console.error("Error stopping audio streaming:", error)
    }
  }

  cleanup() {
    this.stopStreaming()
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }
}
