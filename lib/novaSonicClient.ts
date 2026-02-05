// novaSonicClient.ts
import {
  BedrockRuntimeClient,
  InvokeModelWithBidirectionalStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";

export class NovaSonicBidirectionalStreamClient {
  private bedrockRuntimeClient: BedrockRuntimeClient;
  private asyncQueue: any[] = [];
  private eventHandlers: Record<string, Function[]> = {};
  private streamClosed = false;

  constructor(region: string) {
    this.bedrockRuntimeClient = new BedrockRuntimeClient({ region, credentials: {
      accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
    }, });
  }

  async initiateSession() {
    this.streamClosed = false;

    const asyncIterable = this.createAsyncIterable();

    (async () => {
      try {
        const response = await this.bedrockRuntimeClient.send(
          new InvokeModelWithBidirectionalStreamCommand({
            modelId: "amazon.nova-sonic-v1:0", // ✅ Nova Sonic is called here
            body: asyncIterable,
          })
        );

        if (response.body) {
          for await (const event of response.body) {
            this.handleBedrockEvent(event);
          }
        } else {
          throw new Error("Response body is undefined.");
        }
      } catch (err) {
        console.error("Nova Sonic stream error:", err);
        this.emitEvent("error", err);
      }
    })();
  }

  private createAsyncIterable() {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        while (!self.streamClosed || self.asyncQueue.length > 0) {
          const event = self.asyncQueue.shift();
          if (event) yield event;
          else await new Promise((r) => setTimeout(r, 20));
        }
      },
    };
  }

  private handleBedrockEvent(event: any) {
    if (event.audioOutputChunk) {
      this.emitEvent("audioOutput", Buffer.from(event.audioOutputChunk.bytes));
    } else if (event.textOutput) {
      this.emitEvent("textOutput", event.textOutput);
    }
  }

  enqueueEvent(event: any) {
    this.asyncQueue.push(event);
  }

  setupPromptStartEvent() {
    this.enqueueEvent({ prompt: { role: "user", content: [] } });
  }

  streamAudioChunk(chunk: Buffer) {
    this.enqueueEvent({ audioInput: { audioChunk: chunk } });
  }

  closeSession() {
    this.streamClosed = true;
  }

  registerEventHandler(event: string, handler: Function) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
  }

  private emitEvent(event: string, data: any) {
    (this.eventHandlers[event] || []).forEach((h) => h(data));
  }
}
