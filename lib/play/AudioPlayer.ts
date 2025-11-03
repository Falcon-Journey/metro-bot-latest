export class AudioPlayer {
  private audioContext: AudioContext | null = null
  private gainNode: GainNode | null = null
  private initialized = false

  async start() {
    if (this.initialized) return

    this.audioContext = new AudioContext({
      sampleRate: 24000,
      latencyHint: "interactive",
    })
    this.gainNode = this.audioContext.createGain()
    this.gainNode.gain.value = 0.8
    this.gainNode.connect(this.audioContext.destination)
    this.initialized = true
  }

  async resume() {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume()
    }
  }

  async playAudioFromArrayBuffer(buffer: ArrayBuffer) {
    if (!this.audioContext || !this.gainNode) {
      throw new Error("AudioPlayer not initialized")
    }

    try {
      const audioBuffer = await this.audioContext.decodeAudioData(buffer)
      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.gainNode)
      source.start()
    } catch (error) {
      console.error("Error playing audio:", error)
    }
  }

  stop() {
    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = this.audioContext?.createGain() || null
      if (this.gainNode) {
        this.gainNode.gain.value = 0.8
        this.gainNode.connect(this.audioContext!.destination)
      }
    }
  }

  destroy() {
    this.stop()
    this.audioContext?.close()
    this.audioContext = null
    this.gainNode = null
    this.initialized = false
  }

  get isInitialized() {
    return this.initialized
  }
}
