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

// Let AWS SDK resolve credentials from the environment/role (no custom AWS_* vars needed)
const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const lambda = new LambdaClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});



// Helper functions for state tracking
function extractBookingState(messages: Message[]): any {
  const state: any = {
    name: null,
    email: null,
    phone: null,
    sms_consent: null,
    group_size_category: null,
    num_passengers: null,
    pickup_location: null,
    dropoff_location: null,
    service_date: null,
    trip_direction: null,
    return_date: null,
    return_time: null
  };

  for (const msg of messages) {
    if (msg.role === "user" && msg.content) {
      for (const block of msg.content) {
        if (block.text) {
          const text = block.text.toLowerCase();
          
          // Extract date
          if (!state.service_date && (text.includes('friday') || text.includes('saturday') || 
              text.includes('sunday') || text.includes('monday') || text.includes('tuesday') || 
              text.includes('wednesday') || text.includes('thursday') || /\d{1,2}\/\d{1,2}/.test(text))) {
            state.service_date = block.text.match(/(this |next )?\w+day|(\d{1,2}\/\d{1,2}(\/\d{2,4})?)/i)?.[0] || null;
          }
          
          // Extract trip direction
          if (!state.trip_direction) {
            if (text.includes('round trip') || text.includes('return')) {
              state.trip_direction = 'return';
            } else if (text.includes('book') || text.includes('ride') || text.includes('from')) {
              state.trip_direction = 'one-way';
            }
          }
          
          // Extract passenger count - FIXED REGEX
          if (!state.num_passengers) {
            const match = text.match(/(\d+)\s*(people|passengers?|persons?|pax|passenger)/);
            if (match) {
              state.num_passengers = parseInt(match[1]);
              const count = state.num_passengers;
              if (count <= 4) state.group_size_category = 'small';
              else if (count <= 10) state.group_size_category = 'medium';
              else state.group_size_category = 'large';
            }
          }
          
          // Extract locations
          if (!state.pickup_location || !state.dropoff_location) {
            const fromTo = text.match(/from\s+([^to]+)\s+to\s+(.+?)(?:\s+this|\s+on|\s+for|\s+\d|$)/i);
            if (fromTo) {
              if (!state.pickup_location) state.pickup_location = fromTo[1].trim();
              if (!state.dropoff_location) state.dropoff_location = fromTo[2].trim();
            }
            
            // Look for specific airport mentions
            if (text.includes('airport')) {
              if (text.includes('reagan') || text.includes('dca')) {
                state.pickup_location = state.pickup_location?.includes('dc') ? 'Reagan National (DCA)' : state.pickup_location;
              }
              if (text.includes('dulles') || text.includes('iad')) {
                state.pickup_location = state.pickup_location?.includes('dc') ? 'Dulles (IAD)' : state.pickup_location;
              }
              if (text.includes('jfk')) {
                state.dropoff_location = state.dropoff_location?.includes('nyc') ? 'JFK Airport' : state.dropoff_location;
              }
              if (text.includes('lga') || text.includes('laguardia')) {
                state.dropoff_location = state.dropoff_location?.includes('nyc') ? 'LaGuardia (LGA)' : state.dropoff_location;
              }
            }
          }
          
          // Extract email
          if (!state.email) {
            const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
            if (emailMatch) state.email = emailMatch[0];
          }
          
          // Extract name
          if (!state.name && text.match(/my name is|i'm|i am/i)) {
            const nameMatch = text.match(/(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
            if (nameMatch) state.name = nameMatch[1];
          }
          
          // Extract phone number - matches various formats including 8-10 digit numbers
          if (!state.phone) {
            // First try standard format: (123) 456-7890, 123-456-7890, etc.
            const standardMatch = block.text.match(/(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/);
            if (standardMatch) {
              const digits = standardMatch[2] + standardMatch[3] + standardMatch[4];
              if (digits.length === 10) {
                state.phone = digits;
              }
            }
            
            // Also match any sequence of 8-10 digits (for numbers like 766823932)
            if (!state.phone) {
              const digitSequence = block.text.match(/\b(\d{8,10})\b/);
              if (digitSequence) {
                const digits = digitSequence[1];
                // Exclude if it's part of a date, year, or other common number patterns
                if (digits.length >= 8 && digits.length <= 10) {
                  // Don't match if it looks like a year (1900-2099)
                  if (!(digits.length === 4 && parseInt(digits) >= 1900 && parseInt(digits) <= 2099)) {
                    state.phone = digits;
                  }
                }
              }
            }
          }
          
          // Extract SMS consent - check for explicit consent messages
          // If user just says "yes" or "no" after phone number is provided, treat as SMS consent
          if (state.phone && state.sms_consent === null) {
            // Check for explicit consent with keywords
            if (text.includes('yes') && (text.includes('text') || text.includes('sms') || text.includes('message'))) {
              state.sms_consent = true;
            } else if (text.includes('no') && (text.includes('text') || text.includes('sms') || text.includes('message'))) {
              state.sms_consent = false;
            } 
            // Check for simple yes/no responses (likely SMS consent if phone is already provided)
            // Only set if it's a short response (just "yes" or "no" or very short)
            else if (block.text.trim().toLowerCase() === 'yes' || block.text.trim().toLowerCase() === 'y') {
              state.sms_consent = true;
            } else if (block.text.trim().toLowerCase() === 'no' || block.text.trim().toLowerCase() === 'n') {
              state.sms_consent = false;
            }
          }
        }
      }
    }
  }
  
  return state;
}

function getMissingFields(state: any): string[] {
  const missing: string[] = [];
  
  if (!state.name) missing.push('name');
  if (!state.email) missing.push('email');
  if (!state.phone) missing.push('phone number');
  if (!state.group_size_category) missing.push('group size');
  if (!state.pickup_location || state.pickup_location.length < 5) missing.push('specific pickup location');
  if (!state.dropoff_location || state.dropoff_location.length < 5) missing.push('specific dropoff location');
  if (!state.service_date) missing.push('service date');
  if (!state.trip_direction) missing.push('trip direction');
  
  if (state.trip_direction === 'return') {
    if (!state.return_date) missing.push('return date');
  }
  
  return missing;
}

function buildSystemPrompt(conversationMessages: Message[]): string {
  const bookingState = extractBookingState(conversationMessages);
  
  const basePrompt = `You are a friendly shuttle booking assistant for Metropolitan Shuttle.

YOUR ROLE:
- Help users book shuttle trips quickly and efficiently.
- ALWAYS remember the details the user has already provided. Never ask again for information the user already stated.
- Only ask for missing details, and only when needed for the booking flow.

CRITICAL MEMORY RULE:
Before asking ANY question, review the ENTIRE conversation history. If the user has already provided the information, DO NOT ask for it again under any circumstances.

WHEN ASKING FOR PICKUP/DROPOFF:
- If the user says only the cities (e.g., "DC to NYC"), acknowledge you have pickup city and destination city.
- Then ask *specifically* for exact pickup address/location in the origin city and exact dropoff address/location in the destination city.
- DO NOT ask where the user is going again if they already said (e.g., "DC to NYC").

TOOLS AVAILABLE:
1. save_booking — Save completed booking (call ONLY when all required fields are present).
2. get_pricing — Use when user asks about cost.
3. search_faqs — Use when user asks policy or general questions.

BOOKING FLOW:
1. Progressively collect required info: group size, date, pickup city/location, dropoff city/location, trip direction (one-way or return).
2. Ask at most 2-3 questions at once, but NEVER ask for information already provided.
3. For return trips, also collect return date/time.
4. Collect name and email near the end.
5. When all required fields are collected, call save_booking.
6. After saving, confirm the booking is complete. (Pricing check after save is temporarily disabled)

DATE HANDLING:
- If user says "this Friday," "next Tuesday," "December 12," etc., that IS the service_date.
- NEVER ask for the date again if already provided.
- Current date context: Use relative dates (this Friday = next Friday from today).

TRIP DIRECTION:
- If user says "Book a ride from X to Y" without mentioning "return" or "round trip", assume ONE-WAY.
- NEVER ask about trip direction if the user's phrasing clearly indicates one-way.

REQUIRED FIELDS:
- name
- email
- phone (phone number is required)
- group_size_category (small/medium/large)
- pickup_location (full address or exact spot)
- dropoff_location (full address or exact spot)
- service_date
- trip_direction (infer "one-way" if not specified as return)
- If return trip: return_date, return_time

PHONE NUMBER AND SMS CONSENT:
- Always ask for phone number as it is required for booking
- After the user provides their phone number, acknowledge it and continue with the booking flow
- The SMS consent checkbox will appear automatically in the chat interface - you don't need to mention it
- When user responds with "yes" or "no" (which indicates their SMS consent choice), interpret it as their consent preference
- Include sms_consent field in the booking (true for "yes", false for "no")

EXAMPLES OF CORRECT BEHAVIOR:

Example 1 - Good (No Repetition):
User: "Book a ride from DC to NYC this Friday"
Assistant: "Great! I can help you book from DC to NYC this Friday. I have:
✓ Route: DC to NYC
✓ Date: This Friday (December 12, 2025)
✓ Trip type: One-way

I just need:
- How many passengers? (for group size)
- Specific pickup location in DC? (exact address or landmark)
- Specific dropoff location in NYC? (exact address or landmark)"

User: "10 passengers, will confirm exact location with agency later"
Assistant: "Perfect! 10 passengers (medium group). I have:
✓ 10 passengers (medium group)
✓ Route: DC to NYC
✓ Date: This Friday (December 12, 2025)
✓ Trip type: One-way

I understand you'll confirm exact locations later with the agency. To complete your booking, I just need your name, email address, and phone number."

Example 2 - Bad (Asks for already provided info):
User: "Book a ride from DC to NYC this Friday"
Assistant: "I'll help you book. What date would you like to travel?" ❌ WRONG - Date already provided!
Assistant: "Is this a one-way or round trip?" ❌ WRONG - User said "a ride", implies one-way!

Example 3 - Good (Handles additional details):
User: "6 people, Reagan National to JFK"
Assistant: "Excellent! I have everything for your DC to NYC trip on Friday, December 12:
✓ 6 passengers (medium group)
✓ Reagan National (DCA) to JFK
✓ Date: Friday, December 12, 2025
✓ One-way trip

To complete your booking, I just need your name, email address, and phone number."

STYLE:
- Be concise, helpful, and conversational.
- Never repeat questions the user has already answered.
- Only request the specific missing details.
- Acknowledge what you know before asking for what you need.
- Use checkmarks (✓) to show what information you have.`;

  const stateReminder = `

═══════════════════════════════════════
CURRENT BOOKING STATE (DO NOT ASK FOR THESE AGAIN):
${JSON.stringify(bookingState, null, 2)}

MISSING FIELDS THAT YOU STILL NEED TO ASK FOR:
${getMissingFields(bookingState).join(', ') || 'None - ready to save!'}
═══════════════════════════════════════

REMEMBER: Only ask for the MISSING fields listed above. Never ask for fields that already have values in the booking state.`;

  return basePrompt + stateReminder;
}

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
            phone: { type: "string", description: "Customer phone number (required)" },
            sms_consent: { type: "boolean", description: "Customer consent to receive SMS updates (true/false)" },
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
          required: ["name", "email", "phone", "group_size_category", "pickup_location", "dropoff_location", "service_date", "trip_direction"]
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
        accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
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
      const pricingKbId = process.env.PRICING_KB_ID || "AOHOJWFMJM";
      if (!pricingKbId) return "Pricing information temporarily unavailable.";
      const pricing = await queryKnowledgeBase(pricingKbId, toolInput.query);
      return pricing || "No pricing data found for this query.";

    case "search_faqs":
      const faqKbId = process.env.FAQ_KB_ID || "KJYMZYRF17";
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

    // DEBUG LOGGING
    console.log("📩 Received messages count:", messages.length);
    console.log("📩 Messages:", JSON.stringify(messages, null, 2));

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Convert incoming messages to proper Message[] type
          let conversationMessages: Message[] = messages.map((msg: any) => ({
            role: (msg.role === "user" ? "user" : "assistant") as ConversationRole,
            content: [{ text: msg.content }] as ContentBlock[]
          }));

          // DEBUG: Log extracted state
          const currentState = extractBookingState(conversationMessages);
          console.log("📊 Extracted booking state:", JSON.stringify(currentState, null, 2));
          console.log("❓ Missing fields:", getMissingFields(currentState));

          let continueLoop = true;
          let maxIterations = 5;
          let iteration = 0;

          while (continueLoop && iteration < maxIterations) {
            iteration++;

            // Build dynamic system prompt with current state
            const systemPrompt = buildSystemPrompt(conversationMessages);
            
            const command = new ConverseStreamCommand({
              modelId: "amazon.nova-pro-v1:0",
              messages: conversationMessages,
              system: [{ text: systemPrompt }],
              toolConfig: { tools: TOOLS },
              inferenceConfig: {
                temperature: 0.2,
                topP: 0.9,
                maxTokens: 2048
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
              // Stream text deltas (buffer and strip <thinking> blocks before sending - Nova Pro)
              if (event.contentBlockDelta?.delta?.text) {
                const text = event.contentBlockDelta.delta.text;
                fullText += text;
                // Don't enqueue yet - we'll send after stripping thinking
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



            // Add text content first if exists (use stripped text so history has no thinking)
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