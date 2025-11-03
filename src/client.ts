import * as clientBedrockRuntime from "@aws-sdk/client-bedrock-runtime";
import * as nodeHttpHandler from "@smithy/node-http-handler";
import * as types_1 from "@smithy/types";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import * as types from "./types.ts";
import { Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import * as consts from "./consts.ts";
import { BedrockKnowledgeBaseClient } from "./bedrock-kb-client.ts";

export interface NovaSonicBidirectionalStreamClientConfig {
  requestHandlerConfig?:
  | nodeHttpHandler.NodeHttp2HandlerOptions
  | types_1.Provider<nodeHttpHandler.NodeHttp2HandlerOptions | void>;
  clientConfig: Partial<clientBedrockRuntime.BedrockRuntimeClientConfig>;
  inferenceConfig?: types.InferenceConfig;
}

export class StreamSession {
  private audioBufferQueue: Buffer[] = [];
  private maxQueueSize = 200;
  private isProcessingAudio = false;
  private isActive = true;

  private sessionId: string;
  private client: NovaSonicBidirectionalStreamClient;

  constructor(sessionId: string, client: NovaSonicBidirectionalStreamClient) {
    this.sessionId = sessionId;
    this.client = client;
  }

  // Register event handlers for this specific session
  public onEvent(eventType: string, handler: (data: any) => void): StreamSession {
    this.client.registerEventHandler(this.sessionId, eventType, handler);
    return this; // For chaining
  }

  public async setupPromptStart(): Promise<void> {
    this.client.setupPromptStartEvent(this.sessionId);
  }

  public async setupSystemPrompt(
    textConfig: typeof consts.DefaultTextConfiguration = consts.DefaultTextConfiguration,
    systemPromptContent: string = consts.DefaultSystemPrompt): Promise<void> {
    this.client.setupSystemPromptEvent(this.sessionId, textConfig, systemPromptContent);
  }

  public async setupStartAudio(
    audioConfig: typeof consts.DefaultAudioInputConfiguration = consts.DefaultAudioInputConfiguration
  ): Promise<void> {
    this.client.setupStartAudioEvent(this.sessionId, audioConfig);
  }


  // Stream audio for this session
  public async streamAudio(audioData: Buffer): Promise<void> {
    // Check queue size to avoid memory issues
    if (this.audioBufferQueue.length >= this.maxQueueSize) {
      // Queue is full, drop oldest chunk
      this.audioBufferQueue.shift();
      console.log("Audio queue full, dropping oldest chunk");
    }

    // Queue the audio chunk for streaming
    this.audioBufferQueue.push(audioData);
    this.processAudioQueue();
  }

  // Process audio queue for continuous streaming
  private async processAudioQueue() {
    if (this.isProcessingAudio || this.audioBufferQueue.length === 0 || !this.isActive) return;

    this.isProcessingAudio = true;
    try {
      // Process all chunks in the queue, up to a reasonable limit
      let processedChunks = 0;
      const maxChunksPerBatch = 5; // Process max 5 chunks at a time to avoid overload

      while (this.audioBufferQueue.length > 0 && processedChunks < maxChunksPerBatch && this.isActive) {
        const audioChunk = this.audioBufferQueue.shift();
        if (audioChunk) {
          await this.client.streamAudioChunk(this.sessionId, audioChunk);
          processedChunks++;
        }
      }
    } finally {
      this.isProcessingAudio = false;

      // If there are still items in the queue, schedule the next processing using setTimeout
      if (this.audioBufferQueue.length > 0 && this.isActive) {
        setTimeout(() => this.processAudioQueue(), 0);
      }
    }
  }
  // Get session ID
  public getSessionId(): string {
    return this.sessionId;
  }

  public async endAudioContent(): Promise<void> {
    if (!this.isActive) return;
    await this.client.sendContentEnd(this.sessionId);
  }

  public async endPrompt(): Promise<void> {
    if (!this.isActive) return;
    await this.client.sendPromptEnd(this.sessionId);
  }

  public async close(): Promise<void> {
    if (!this.isActive) return;

    this.isActive = false;
    this.audioBufferQueue = []; // Clear any pending audio

    await this.client.sendSessionEnd(this.sessionId);
    console.log(`Session ${this.sessionId} close completed`);
  }
}

// Session data type
interface SessionData {
  queue: Array<any>;
  queueSignal: Subject<void>;
  closeSignal: Subject<void>;
  responseSubject: Subject<any>;
  toolUseContent: any;
  toolUseId: string;
  toolName: string;
  responseHandlers: Map<string, (data: any) => void>;
  promptName: string;
  inferenceConfig: types.InferenceConfig;
  isActive: boolean;
  isPromptStartSent: boolean;
  isAudioContentStartSent: boolean;
  audioContentId: string;
  selectedUserId?: string;
  selectedVoiceId?: string;
  agentType?: "retrieval" | "booking";

}

export class NovaSonicBidirectionalStreamClient {
  private bedrockRuntimeClient: clientBedrockRuntime.BedrockRuntimeClient;
  private inferenceConfig: types.InferenceConfig;
  private activeSessions: Map<string, SessionData> = new Map();
  private sessionLastActivity: Map<string, number> = new Map();
  private sessionCleanupInProgress = new Set<string>();


  constructor(config: NovaSonicBidirectionalStreamClientConfig) {
    const http2Client = new nodeHttpHandler.NodeHttp2Handler({
      requestTimeout: 300000,
      sessionTimeout: 300000,
      disableConcurrentStreams: false,
      maxConcurrentStreams: 20,
      ...config.requestHandlerConfig,
    });

    if (!config.clientConfig.credentials) {
      throw new Error("No credentials provided");
    }

    this.bedrockRuntimeClient = new clientBedrockRuntime.BedrockRuntimeClient({
      ...config.clientConfig,
      credentials: config.clientConfig.credentials,
      region: config.clientConfig.region || "us-east-1",
      requestHandler: http2Client
    });

    this.inferenceConfig = config.inferenceConfig ?? {
      maxTokens: 1024,
      topP: 0.9,
      temperature: 0.7,
    };
  }

  public isSessionActive(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    return !!session && session.isActive;
  }

  public getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  public getLastActivityTime(sessionId: string): number {
    return this.sessionLastActivity.get(sessionId) || 0;
  }

  private updateSessionActivity(sessionId: string): void {
    this.sessionLastActivity.set(sessionId, Date.now());
  }

  public isCleanupInProgress(sessionId: string): boolean {
    return this.sessionCleanupInProgress.has(sessionId);
  }


  // Create a new streaming session
  public createStreamSession(sessionId: string = randomUUID(), config?: NovaSonicBidirectionalStreamClientConfig,  agentType: "retrieval" | "booking" = "retrieval"
): StreamSession {
    if (this.activeSessions.has(sessionId)) {
      throw new Error(`Stream session with ID ${sessionId} already exists`);
    }
    

    const session: SessionData = {
      queue: [],
      queueSignal: new Subject<void>(),
      closeSignal: new Subject<void>(),
      responseSubject: new Subject<any>(),
      toolUseContent: null,
      toolUseId: "",
      toolName: "",
      responseHandlers: new Map(),
      promptName: randomUUID(),
      inferenceConfig: config?.inferenceConfig ?? this.inferenceConfig,
      isActive: true,
      isPromptStartSent: false,
      isAudioContentStartSent: false,
      audioContentId: randomUUID(),
      agentType,
    };

    this.activeSessions.set(sessionId, session);

    return new StreamSession(sessionId, this);
  }

  private async processToolUse(sessionId: string, toolName: string, toolUseContent: object): Promise<Object> {
    const tool = toolName.toLowerCase();

    switch (tool) {
      case "retrieve_kb_docs":
        console.log(`Retrieving knowledge base documents: ${JSON.stringify(toolUseContent)}`);
        const kbContent = await this.parseToolUseContent(toolUseContent);
        if (!kbContent) {
          throw new Error('parsedContent is undefined');
        }
        return this.queryKnowledgeBase(kbContent?.query, kbContent?.maxResults, sessionId);
      default:
        console.log(`Tool ${tool} not supported`)
        throw new Error(`Tool ${tool} not supported`);
    }
  }

  private async queryKnowledgeBase(
  query: string,
  numberOfResults: number = 3,
  sessionId?: string
): Promise<object> {
  const kbClient = new BedrockKnowledgeBaseClient(process.env.AWS_REGION || "us-east-1");

  // Default agent type
  let agentType: "retrieval" | "booking" = "retrieval";

  // ✅ Get agent type from active session
  if (sessionId && this.activeSessions?.has(sessionId)) {
    const session = this.activeSessions.get(sessionId);
    if (session?.agentType) {
      agentType = session.agentType;
    }
  }

  try {
    let kbIds: string[] = [];

    if (agentType === "retrieval") {
      // ✅ Retrieval agent has multiple KBs
      kbIds = [
        process.env.KB_ID_RETRIEVAL_MAIN || "H8REU8WUQ9",
        process.env.KB_ID_RETRIEVAL_SECONDARY || "WAJPJFUNTH",
      ];
    } else if (agentType === "booking") {
      // ✅ Booking agent has one KB
      kbIds = [process.env.KB_ID_BOOKING_MAIN || "WAJPJFUNTH",
        process.env.KB_ID_BOOKING_SECONDARY || "H8REU8WUQ9",
      ];
    }

    if (kbIds.length === 0) {
      console.warn("No Knowledge Base IDs found for this agent type.");
      return { error: "No KB IDs configured" };
    }

    console.log(
      `🔍 Searching ${kbIds.length} KB(s) for query "${query}" (agentType: ${agentType})`
    );

    // ✅ Retrieve from all KBs concurrently
    const allResults = await Promise.all(
      kbIds.map(async (id) => {
        try {
          const res = await kbClient.retrieveFromKnowledgeBase({
            knowledgeBaseId: id,
            query,
            numberOfResults,
          });
          console.log(`Results from KB(${id}): ${JSON.stringify(res)}`);
          return res;
        } catch (err) {
          console.error(`Error retrieving from KB(${id}):`, err);
          return null;
        }
      })
    );

    // ✅ Merge & filter results
    const mergedResults = allResults
      .filter((r): r is NonNullable<typeof r> => !!r)
      .flatMap((r: any) => r.results || []);

    return {
      agentType,
      knowledgeBasesQueried: kbIds,
      totalResults: mergedResults.length,
      results: mergedResults,
    };
  } catch (error) {
    console.error("KB Error:", error);
    return { agentType, error: error instanceof Error ? error.message : error };
  }
}


  // No mock tool implementations; only knowledge base retrieval is enabled

  private async parseToolUseContent(toolUseContent: any): Promise<{ query: string; maxResults: number; } | null> {
    try {
      // Case 1: model returns a JSON string at content
      if (toolUseContent && typeof toolUseContent.content === 'string') {
        const parsedContent = JSON.parse(toolUseContent.content);
        return {
          query: parsedContent.query,
          maxResults: parsedContent?.maxResults
        };
      }

      // Case 2: model returns input.json object
      if (toolUseContent?.input?.json && typeof toolUseContent.input.json === 'object') {
        const json = toolUseContent.input.json;
        return {
          query: json.query,
          maxResults: json?.maxResults
        };
      }

      // Case 3: model returns input as a string JSON
      if (toolUseContent?.input && typeof toolUseContent.input === 'string') {
        const parsed = JSON.parse(toolUseContent.input);
        return {
          query: parsed.query,
          maxResults: parsed?.maxResults
        };
      }

      // Case 4: already an object { query, maxResults }
      if (toolUseContent && typeof toolUseContent === 'object' && 'query' in toolUseContent) {
        return {
          query: toolUseContent.query,
          maxResults: (toolUseContent as any)?.maxResults
        };
      }

      return null;
    } catch (error) {
      console.error("Failed to parse tool use content:", error);
      return null;
    }
  }

  // Stream audio for a specific session
  public async initiateSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Stream session ${sessionId} not found`);
    }

    try {
      // Set up initial events for this session
      this.setupSessionStartEvent(sessionId);

      // Create the bidirectional stream with session-specific async iterator
      const asyncIterable = this.createSessionAsyncIterable(sessionId);

      console.log(`Starting bidirectional stream for session ${sessionId}...`);

      const response = await this.bedrockRuntimeClient.send(
        new clientBedrockRuntime.InvokeModelWithBidirectionalStreamCommand({
          modelId: "amazon.nova-sonic-v1:0",
          body: asyncIterable,
        })
      );

      console.log(`Stream established for session ${sessionId}, processing responses...`);

      // Process responses for this session
      await this.processResponseStream(sessionId, response);

    } catch (error) {
      console.error(`Error in session ${sessionId}: `, error);
      this.dispatchEventForSession(sessionId, 'error', {
        source: 'bidirectionalStream',
        error
      });

      // Make sure to clean up if there's an error
      if (session.isActive) {
        this.closeSession(sessionId);
      }
    }
  }

  // Dispatch events to handlers for a specific session
  private dispatchEventForSession(sessionId: string, eventType: string, data: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        console.error(`Error in ${eventType} handler for session ${sessionId}: `, e);
      }
    }

    // Also dispatch to "any" handlers
    const anyHandler = session.responseHandlers.get('any');
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        console.error(`Error in 'any' handler for session ${sessionId}: `, e);
      }
    }
  }

  private createSessionAsyncIterable(sessionId: string): AsyncIterable<clientBedrockRuntime.InvokeModelWithBidirectionalStreamInput> {

    if (!this.isSessionActive(sessionId)) {
      console.log(`Cannot create async iterable: Session ${sessionId} not active`);
      return {
        [Symbol.asyncIterator]: () => ({
          next: async () => ({ value: undefined, done: true })
        })
      };
    }

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Cannot create async iterable: Session ${sessionId} not found`);
    }

    let eventCount = 0;

    return {
      [Symbol.asyncIterator]: () => {
        console.log(`AsyncIterable iterator requested for session ${sessionId}`);

        return {
          next: async (): Promise<IteratorResult<clientBedrockRuntime.InvokeModelWithBidirectionalStreamInput>> => {
            try {
              // Check if session is still active
              if (!session.isActive || !this.activeSessions.has(sessionId)) {
                console.log(`Iterator closing for session ${sessionId}, done = true`);
                return { value: undefined, done: true };
              }
              // Wait for items in the queue or close signal
              if (session.queue.length === 0) {
                try {
                  await Promise.race([
                    firstValueFrom(session.queueSignal.pipe(take(1))),
                    firstValueFrom(session.closeSignal.pipe(take(1))).then(() => {
                      throw new Error("Stream closed");
                    })
                  ]);
                } catch (error) {
                  if (error instanceof Error) {
                    if (error.message === "Stream closed" || !session.isActive) {
                      // This is an expected condition when closing the session
                      if (this.activeSessions.has(sessionId)) {
                        console.log(`Session \${ sessionId } closed during wait`);
                      }
                      return { value: undefined, done: true };
                    }
                  }
                  else {
                    console.error(`Error on event close`, error)
                  }
                }
              }

              // If queue is still empty or session is inactive, we're done
              if (session.queue.length === 0 || !session.isActive) {
                console.log(`Queue empty or session inactive: ${sessionId} `);
                return { value: undefined, done: true };
              }

              // Get next item from the session's queue
              const nextEvent = session.queue.shift();
              eventCount++;

              //console.log(`Sending event #${ eventCount } for session ${ sessionId }: ${ JSON.stringify(nextEvent).substring(0, 100) }...`);

              return {
                value: {
                  chunk: {
                    bytes: new TextEncoder().encode(JSON.stringify(nextEvent))
                  }
                },
                done: false
              };
            } catch (error) {
              console.error(`Error in session ${sessionId} iterator: `, error);
              session.isActive = false;
              return { value: undefined, done: true };
            }
          },

          return: async (): Promise<IteratorResult<clientBedrockRuntime.InvokeModelWithBidirectionalStreamInput>> => {
            console.log(`Iterator return () called for session ${sessionId}`);
            session.isActive = false;
            return { value: undefined, done: true };
          },

          throw: async (error: any): Promise<IteratorResult<clientBedrockRuntime.InvokeModelWithBidirectionalStreamInput>> => {
            console.log(`Iterator throw () called for session ${sessionId} with error: `, error);
            session.isActive = false;
            throw error;
          }
        };
      }
    };
  }

  // Process the response stream from AWS Bedrock
  private async processResponseStream(sessionId: string, response: any): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      for await (const event of response.body) {
        if (!session.isActive) {
          console.log(`Session ${sessionId} is no longer active, stopping response processing`);
          break;
        }
        if (event.chunk?.bytes) {
          try {
            this.updateSessionActivity(sessionId);
            const textResponse = new TextDecoder().decode(event.chunk.bytes);

            try {
              const jsonResponse = JSON.parse(textResponse);
              if (jsonResponse.event?.contentStart) {
                this.dispatchEvent(sessionId, 'contentStart', jsonResponse.event.contentStart);
              } else if (jsonResponse.event?.textOutput) {
                this.dispatchEvent(sessionId, 'textOutput', jsonResponse.event.textOutput);
              } else if (jsonResponse.event?.audioOutput) {
                this.dispatchEvent(sessionId, 'audioOutput', jsonResponse.event.audioOutput);
              } else if (jsonResponse.event?.toolUse) {
                this.dispatchEvent(sessionId, 'toolUse', jsonResponse.event.toolUse);

                // Store tool use information for later
                session.toolUseContent = jsonResponse.event.toolUse;
                session.toolUseId = jsonResponse.event.toolUse.toolUseId;
                session.toolName = jsonResponse.event.toolUse.toolName;
              } else if (jsonResponse.event?.contentEnd &&
                jsonResponse.event?.contentEnd?.type === 'TOOL') {

                // Process tool use
                console.log(`Processing tool use for session ${sessionId}`);
                this.dispatchEvent(sessionId, 'toolEnd', {
                  toolUseContent: session.toolUseContent,
                  toolUseId: session.toolUseId,
                  toolName: session.toolName
                });

                console.log("calling tooluse");
                console.log("tool use content : ", session.toolUseContent)
                // function calling
                const toolResult = await this.processToolUse(sessionId, session.toolName, session.toolUseContent);

                // Send tool result
                this.sendToolResult(sessionId, session.toolUseId, toolResult);

                // Also dispatch event about tool result
                this.dispatchEvent(sessionId, 'toolResult', {
                  toolUseId: session.toolUseId,
                  result: toolResult
                });
              } else if (jsonResponse.event?.contentEnd) {
                this.dispatchEvent(sessionId, 'contentEnd', jsonResponse.event.contentEnd);
              }
              else {
                // Handle other events
                const eventKeys = Object.keys(jsonResponse.event || {});
                console.log(`Event keys for session ${sessionId}: `, eventKeys)
                console.log(`Handling other events`)
                if (eventKeys.length > 0) {
                  this.dispatchEvent(sessionId, eventKeys[0], jsonResponse.event);
                } else if (Object.keys(jsonResponse).length > 0) {
                  this.dispatchEvent(sessionId, 'unknown', jsonResponse);
                }
              }
            } catch (e) {
              console.log(`Raw text response for session ${sessionId}(parse error): `, textResponse);
            }
          } catch (e) {
            console.error(`Error processing response chunk for session ${sessionId}: `, e);
          }
        } else if (event.modelStreamErrorException) {
          console.error(`Model stream error for session ${sessionId}: `, event.modelStreamErrorException);
          this.dispatchEvent(sessionId, 'error', {
            type: 'modelStreamErrorException',
            details: event.modelStreamErrorException
          });
        } else if (event.internalServerException) {
          console.error(`Internal server error for session ${sessionId}: `, event.internalServerException);
          this.dispatchEvent(sessionId, 'error', {
            type: 'internalServerException',
            details: event.internalServerException
          });
        }
      }

      console.log(`Response stream processing complete for session ${sessionId}`);
      this.dispatchEvent(sessionId, 'streamComplete', {
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`Error processing response stream for session ${sessionId}: `, error);
      this.dispatchEvent(sessionId, 'error', {
        source: 'responseStream',
        message: 'Error processing response stream',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Add an event to a session's queue
  private addEventToSessionQueue(sessionId: string, event: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive) return;

    this.updateSessionActivity(sessionId);
    session.queue.push(event);
    session.queueSignal.next();
  }


  // Set up initial events for a session
  private setupSessionStartEvent(sessionId: string): void {
    console.log(`Setting up initial events for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Session start event
    this.addEventToSessionQueue(sessionId, {
      event: {
        sessionStart: {
          inferenceConfiguration: session.inferenceConfig
        }
      }
    });
  }
  public setupPromptStartEvent(sessionId: string): void {
    console.log(`Setting up prompt start event for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    // Prompt start event
    this.addEventToSessionQueue(sessionId, {
      event: {
        promptStart: {
          promptName: session.promptName,
          textOutputConfiguration: {
            mediaType: "text/plain",
          },
          audioOutputConfiguration: {
            ...consts.DefaultAudioOutputConfiguration,
            voiceId: session.selectedVoiceId || consts.DefaultAudioOutputConfiguration.voiceId,
          },
          toolUseOutputConfiguration: {
            mediaType: "application/json",
          },
          toolConfiguration: {
            "toolChoice": {
              "tool": { "name": "retrieve_kb_docs" }
            },
            tools: [
              {
                toolSpec: {
                  name: "retrieve_kb_docs",
                  description: "Retrieves relevant documents from the Bedrock Knowledge Base to support training, recovery, and wellness guidance.",
                  inputSchema: {
                    json: consts.KnowledgeBaseToolSchema
                  }
                }
              }
            ]
          },
        },
      }
    });
    session.isPromptStartSent = true;
  }

  public setupSystemPromptEvent(sessionId: string,
    textConfig: typeof consts.DefaultTextConfiguration = consts.DefaultTextConfiguration,
    systemPromptContent: string = consts.DefaultSystemPrompt
  ): void {
    console.log(`Setting up systemPrompt events for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    // Text content start
    const textPromptID = randomUUID();
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: textPromptID,
          type: "TEXT",
          interactive: true,
          role: "SYSTEM",
          textInputConfiguration: textConfig,
        },
      }
    });

    // Text input content
    this.addEventToSessionQueue(sessionId, {
      event: {
        textInput: {
          promptName: session.promptName,
          contentName: textPromptID,
          content: systemPromptContent,
        },
      }
    });

    // Text content end
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: textPromptID,
        },
      }
    });
  }

  public setupStartAudioEvent(
    sessionId: string,
    audioConfig: typeof consts.DefaultAudioInputConfiguration = consts.DefaultAudioInputConfiguration
  ): void {
    console.log(`Setting up startAudioContent event for session ${sessionId}...`);
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    console.log(`Using audio content ID: ${session.audioContentId}`);
    // Audio content start
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          type: "AUDIO",
          interactive: true,
          role: "USER",
          audioInputConfiguration: audioConfig,
        },
      }
    });
    session.isAudioContentStartSent = true;
    console.log(`Initial events setup complete for session ${sessionId}`);
  }

  // Stream an audio chunk for a session
  public async streamAudioChunk(sessionId: string, audioData: Buffer): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isActive || !session.audioContentId) {
      throw new Error(`Invalid session ${sessionId} for audio streaming`);
    }
    // Convert audio to base64
    const base64Data = audioData.toString('base64');

    this.addEventToSessionQueue(sessionId, {
      event: {
        audioInput: {
          promptName: session.promptName,
          contentName: session.audioContentId,
          content: base64Data,
        },
      }
    });
  }


  // Send tool result back to the model
  private async sendToolResult(sessionId: string, toolUseId: string, result: any): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    console.log("inside tool result")
    if (!session || !session.isActive) return;

    console.log(`Sending tool result for session ${sessionId}, tool use ID: ${toolUseId}`);
    const contentId = randomUUID();

    // Tool content start
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentStart: {
          promptName: session.promptName,
          contentName: contentId,
          interactive: false,
          type: "TOOL",
          role: "TOOL",
          toolResultInputConfiguration: {
            toolUseId: toolUseId,
            type: "TEXT",
            textInputConfiguration: {
              mediaType: "text/plain"
            }
          }
        }
      }
    });

    // Tool content input
    const resultContent = typeof result === 'string' ? result : JSON.stringify(result);
    this.addEventToSessionQueue(sessionId, {
      event: {
        toolResult: {
          promptName: session.promptName,
          contentName: contentId,
          content: resultContent
        }
      }
    });

    // Tool content end
    this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: contentId
        }
      }
    });

    console.log(`Tool result sent for session ${sessionId}`);
  }

  public async sendContentEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isAudioContentStartSent) return;

    await this.addEventToSessionQueue(sessionId, {
      event: {
        contentEnd: {
          promptName: session.promptName,
          contentName: session.audioContentId,
        }
      }
    });

    // Wait to ensure it's processed
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  public async sendPromptEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.isPromptStartSent) return;

    await this.addEventToSessionQueue(sessionId, {
      event: {
        promptEnd: {
          promptName: session.promptName
        }
      }
    });

    // Wait to ensure it's processed
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  public async sendSessionEnd(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    await this.addEventToSessionQueue(sessionId, {
      event: {
        sessionEnd: {}
      }
    });

    // Wait to ensure it's processed
    await new Promise(resolve => setTimeout(resolve, 300));

    // Now it's safe to clean up
    session.isActive = false;
    session.closeSignal.next();
    session.closeSignal.complete();
    this.activeSessions.delete(sessionId);
    this.sessionLastActivity.delete(sessionId);
    console.log(`Session ${sessionId} closed and removed from active sessions`);
  }

  // Register an event handler for a session
  public registerEventHandler(sessionId: string, eventType: string, handler: (data: any) => void): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.responseHandlers.set(eventType, handler);
  }

  // Set selected user_id for a specific session
  public setSessionUserId(sessionId: string, userId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    session.selectedUserId = userId;
  }

  // Set selected voiceId for a specific session
  public setSessionVoiceId(sessionId: string, voiceId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    session.selectedVoiceId = voiceId;
  }

  // Dispatch an event to registered handlers
  private dispatchEvent(sessionId: string, eventType: string, data: any): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        console.error(`Error in ${eventType} handler for session ${sessionId}:`, e);
      }
    }

    // Also dispatch to "any" handlers
    const anyHandler = session.responseHandlers.get('any');
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        console.error(`Error in 'any' handler for session ${sessionId}:`, e);
      }
    }
  }

  public async closeSession(sessionId: string): Promise<void> {
    if (this.sessionCleanupInProgress.has(sessionId)) {
      console.log(`Cleanup already in progress for session ${sessionId}, skipping`);
      return;
    }
    this.sessionCleanupInProgress.add(sessionId);
    try {
      console.log(`Starting close process for session ${sessionId}`);
      await this.sendContentEnd(sessionId);
      await this.sendPromptEnd(sessionId);
      await this.sendSessionEnd(sessionId);
      console.log(`Session ${sessionId} cleanup complete`);
    } catch (error) {
      console.error(`Error during closing sequence for session ${sessionId}:`, error);

      // Ensure cleanup happens even if there's an error
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.isActive = false;
        this.activeSessions.delete(sessionId);
        this.sessionLastActivity.delete(sessionId);
      }
    } finally {
      // Always clean up the tracking set
      this.sessionCleanupInProgress.delete(sessionId);
    }
  }

  // Same for forceCloseSession:
  public forceCloseSession(sessionId: string): void {
    if (this.sessionCleanupInProgress.has(sessionId) || !this.activeSessions.has(sessionId)) {
      console.log(`Session ${sessionId} already being cleaned up or not active`);
      return;
    }

    this.sessionCleanupInProgress.add(sessionId);
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) return;

      console.log(`Force closing session ${sessionId}`);

      // Immediately mark as inactive and clean up resources
      session.isActive = false;
      session.closeSignal.next();
      session.closeSignal.complete();
      this.activeSessions.delete(sessionId);
      this.sessionLastActivity.delete(sessionId);

      console.log(`Session ${sessionId} force closed`);
    } finally {
      this.sessionCleanupInProgress.delete(sessionId);
    }
  }

}