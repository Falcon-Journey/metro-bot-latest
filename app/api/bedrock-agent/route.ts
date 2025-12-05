import { 
  BedrockRuntimeClient, 
  ConverseStreamCommand,
  ContentBlock,
  ConversationRole,
  Message,
  Tool,
  ToolInputSchema
} from "@aws-sdk/client-bedrock-runtime";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { NextRequest } from "next/server";

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const lambda = new LambdaClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const SYSTEM_PROMPT = `You are a friendly shuttle booking assistant for Metropolitan Shuttle.

YOUR ROLE:
- Help users book shuttle trips quickly and efficiently
- Collect required info: name, email, group size, pickup/dropoff, service date, trip direction
- For return trips, also collect return date/time
- Ask max 3 questions at once
- Be conversational and natural

TOOLS AVAILABLE:
1. save_booking - Save completed booking to system
2. get_pricing - Retrieve pricing estimates from knowledge base
3. search_faqs - Search FAQ knowledge base

BOOKING FLOW:
1. Greet and ask where they want to go
2. Progressively collect: group size, date, trip type (one-way/return)
3. Get contact info (name, email) near the end
4. When all required fields collected, call save_booking
5. After successful save, offer to check pricing if not already provided

REQUIRED FIELDS:
- name, email, group_size_category, pickup_location, dropoff_location, service_date, trip_direction
- If return trip: return_date, return_time

BE CONCISE. Don't over-explain. Natural conversation flow.`;

const TOOLS: Tool[] = [
  {
    toolSpec: {
      name: "save_booking",
      description: "Save a completed shuttle booking to the system. Only call when ALL required fields are collected.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            name: { type: "string", description: "Customer full name" },
            email: { type: "string", description: "Customer email" },
            phone: { type: "string", description: "Customer phone (optional)" },
            group_size_category: { type: "string", description: "small, medium, or large" },
            num_passengers: { type: "number", description: "Exact passenger count (optional)" },
            pickup_location: { type: "string", description: "Pickup address/location" },
            dropoff_location: { type: "string", description: "Dropoff address/location" },
            service_date: { type: "string", description: "Trip date (YYYY-MM-DD or natural)" },
            departure_time: { type: "string", description: "Departure time (optional)" },
            trip_direction: { type: "string", description: "One-way or Return" },
            return_date: { type: "string", description: "Return date if return trip" },
            return_time: { type: "string", description: "Return time if return trip" },
            vehicle_type: { type: "string", description: "Vehicle preference (optional)" },
            additional_info: { type: "string", description: "Extra notes (optional)" }
          },
          required: ["name", "email", "group_size_category", "pickup_location", "dropoff_location", "service_date", "trip_direction"]
        }
      } as ToolInputSchema
    }
  },
  {
    toolSpec: {
      name: "get_pricing",
      description: "Search knowledge base for pricing estimates. Use when user asks about price/cost.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            query: { type: "string", description: "Pricing query (e.g., 'DC to NYC 15 passengers')" }
          },
          required: ["query"]
        }
      } as ToolInputSchema
    }
  },
  {
    toolSpec: {
      name: "search_faqs",
      description: "Search FAQ knowledge base. Use when user asks general questions about services, policies, etc.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            query: { type: "string", description: "FAQ search query" }
          },
          required: ["query"]
        }
      } as ToolInputSchema
    }
  }
];

async function invokeLambda(functionName: string, payload: any) {
  try {
    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(payload),
    });
    const response = await lambda.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    return result;
  } catch (error) {
    console.error("Lambda invocation error:", error);
    return { error: "Failed to save booking" };
  }
}

async function queryKnowledgeBase(kbId: string, query: string) {
  try {
    const { BedrockAgentRuntimeClient, RetrieveCommand } = await import("@aws-sdk/client-bedrock-agent-runtime");
    const agentRuntime = new BedrockAgentRuntimeClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const cmd = new RetrieveCommand({
      knowledgeBaseId: kbId,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: { numberOfResults: 5 }
      }
    });

    const response = await agentRuntime.send(cmd);
    const results = response.retrievalResults || [];
    return results.map(r => r.content?.text || "").join("\n\n");
  } catch (error) {
    console.error("KB query error:", error);
    return "Unable to retrieve information at this time.";
  }
}

async function handleToolCall(toolName: string, toolInput: any) {
  switch (toolName) {
    case "save_booking":
      const lambdaPayload = {
        parameters: [
          { name: "bookingData", value: JSON.stringify(toolInput) }
        ]
      };
      const result = await invokeLambda("store-shuttle-booking", lambdaPayload);
      return JSON.stringify({
        status: "success",
        message: result.response?.functionResponse?.responseBody?.TEXT?.body || "Booking saved successfully"
      });

    case "get_pricing":
      const pricingKbId = process.env.PRICING_KB_ID || "";
      if (!pricingKbId) return "Pricing information temporarily unavailable.";
      const pricing = await queryKnowledgeBase(pricingKbId, toolInput.query);
      return pricing || "No pricing data found for this query.";

    case "search_faqs":
      const faqKbId = process.env.FAQ_KB_ID || "";
      if (!faqKbId) return "FAQ information temporarily unavailable.";
      const faq = await queryKnowledgeBase(faqKbId, toolInput.query);
      return faq || "No FAQ information found.";

    default:
      return "Unknown tool";
  }
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response("Invalid request: messages array required", { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Convert incoming messages to proper Message[] type
          let conversationMessages: Message[] = messages.map((msg: any) => ({
            role: (msg.role === "user" ? "user" : "assistant") as ConversationRole,
            content: [{ text: msg.content }] as ContentBlock[]
          }));

          let continueLoop = true;
          let maxIterations = 5;
          let iteration = 0;

          while (continueLoop && iteration < maxIterations) {
            iteration++;

            const command = new ConverseStreamCommand({
              modelId: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
              messages: conversationMessages,
              system: [{ text: SYSTEM_PROMPT }],
              toolConfig: { tools: TOOLS },
              inferenceConfig: {
                temperature: 0.3,
                topP: 0.9,
                maxTokens: 1024
              }
            });

            const response = await bedrock.send(command);

            if (!response.stream) {
              controller.enqueue(encoder.encode("Error: No stream available\n"));
              controller.close();
              return;
            }

            let currentToolUse: any = null;
            let assistantContent: ContentBlock[] = [];
            let fullText = "";

            for await (const event of response.stream) {
              // Stream text deltas
              if (event.contentBlockDelta?.delta?.text) {
                const text = event.contentBlockDelta.delta.text;
                fullText += text;
                controller.enqueue(encoder.encode(text));
              }

              // Capture tool use start
              if (event.contentBlockStart?.start?.toolUse) {
                currentToolUse = {
                  toolUseId: event.contentBlockStart.start.toolUse.toolUseId,
                  name: event.contentBlockStart.start.toolUse.name,
                  input: ""
                };
              }

              // Accumulate tool input
              if (event.contentBlockDelta?.delta?.toolUse?.input) {
                if (currentToolUse) {
                  currentToolUse.input += event.contentBlockDelta.delta.toolUse.input;
                }
              }

              // Tool use complete
              if (event.contentBlockStop && currentToolUse) {
                try {
                  assistantContent.push({
                    toolUse: {
                      toolUseId: currentToolUse.toolUseId,
                      name: currentToolUse.name,
                      input: JSON.parse(currentToolUse.input)
                    }
                  } as ContentBlock);
                } catch (e) {
                  console.error("Failed to parse tool input:", e);
                }
                currentToolUse = null;
              }

              // Message stop
              if (event.messageStop) {
                continueLoop = false;
              }
            }

            // Add text content first if exists
            if (fullText) {
              assistantContent.unshift({ text: fullText } as ContentBlock);
            }

            // Add assistant message to history
            if (assistantContent.length > 0) {
              conversationMessages.push({
                role: "assistant" as ConversationRole,
                content: assistantContent
              });
            }

            // Handle tool calls
            const toolCalls = assistantContent.filter(c => c.toolUse);
            if (toolCalls.length > 0) {
              continueLoop = true;
              const toolResults: ContentBlock[] = [];

              for (const tc of toolCalls) {
                if (!tc.toolUse) continue;
                
                const toolName = tc.toolUse.name;
                const toolInput = tc.toolUse.input;
                const toolUseId = tc.toolUse.toolUseId;

                const result = await handleToolCall(toolName || "", toolInput);
                toolResults.push({
                  toolResult: {
                    toolUseId: toolUseId || "",
                    content: [{ text: result }]
                  }
                } as ContentBlock);
              }

              conversationMessages.push({
                role: "user" as ConversationRole,
                content: toolResults
              });
            } else {
              continueLoop = false;
            }
          }

          controller.close();
        } catch (error) {
          console.error("Stream processing error:", error);
          controller.enqueue(encoder.encode("\n\nError: Unable to process request."));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    console.error("API route error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}