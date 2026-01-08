import { 
  BedrockRuntimeClient, 
  ConverseStreamCommand,
  ContentBlock,
  ConversationRole,
  Message,
  Tool,
  ToolInputSchema
} from "@aws-sdk/client-bedrock-runtime";
import { NextRequest } from "next/server";

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

function buildSystemPrompt(): string {
  return `You are a helpful assistant for Metropolitan Shuttle that helps users query vendor history and trip pricing information.

YOUR ROLE:
- Help users find historical trip information from the knowledge base
- Search for trips by name, route, vendor, or date
- Provide pricing information and vendor details for past trips
- List vendors and their associated trip costs

CAPABILITIES:
1. Search trips by route/name (e.g., "CI to Sacramento", "trip to French Village")
2. Find all trips for a specific vendor
3. Calculate total costs for trips matching criteria
4. List vendors and their trip history

KNOWLEDGE BASE DATA STRUCTURE:
The knowledge base contains JSON records with the following fields:
- Name: Trip name/description (e.g., "CI - 04/22 - trip to Sacramento, CA")
- TotalPrice: Total price for the trip
- Subtotal: Subtotal amount
- Vendor_Name__c: Vendor ID (may be null)
- CreatedDate: Date when the record was created
- QuoteNumber: Quote number
- OpportunityId: Opportunity ID

SEARCH STRATEGIES:
- When user asks about a route (e.g., "CI to Sacramento"), search for trip names containing those location keywords
- When user asks about a vendor, search for records with that vendor ID or name
- When user asks for pricing, extract and sum TotalPrice values from matching records
- When user asks for a list of vendors, aggregate trips by Vendor_Name__c

RESPONSE FORMAT:
- Be clear and concise
- When listing trips, include: Trip name, Total Price, Vendor (if available), Date
- When calculating totals, show the breakdown and sum
- If no results found, suggest alternative search terms

TOOLS AVAILABLE:
- search_vendor_history: Search the knowledge base for trip and vendor information`;
}

const TOOLS: Tool[] = [
  {
    toolSpec: {
      name: "search_vendor_history",
      description: "Search the vendor history knowledge base for trips, vendors, and pricing information. Use this tool to find trips by name/route, find trips by vendor, or get pricing data.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            query: { 
              type: "string", 
              description: "Search query. Examples: 'CI to Sacramento', 'trips for vendor X', 'all trips to French Village', 'vendor history', 'pricing for Sacramento trips'" 
            }
          },
          required: ["query"]
        }
      } as ToolInputSchema
    }
  }
];

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
        vectorSearchConfiguration: { numberOfResults: 10 }
      }
    });

    const response = await agentRuntime.send(cmd);
    const results = response.retrievalResults || [];
    
    // Parse and format the results
    const formattedResults: any[] = [];
    
    for (const result of results) {
      const text = result.content?.text || "";
      if (!text) continue;
      
      // Try to parse JSON from the result
      try {
        // The text might contain JSON objects (could be on single line or multiple lines)
        // Try to find complete JSON objects by matching braces
        let braceCount = 0;
        let startIndex = -1;
        let jsonStrings: string[] = [];
        
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '{') {
            if (braceCount === 0) startIndex = i;
            braceCount++;
          } else if (text[i] === '}') {
            braceCount--;
            if (braceCount === 0 && startIndex !== -1) {
              jsonStrings.push(text.substring(startIndex, i + 1));
              startIndex = -1;
            }
          }
        }
        
        // Try to parse each JSON string
        for (const jsonStr of jsonStrings) {
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.Name || parsed.TotalPrice !== undefined) {
              formattedResults.push(parsed);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
        
        // If no JSON objects found, try parsing the whole text as JSON
        if (formattedResults.length === 0) {
          try {
            const parsed = JSON.parse(text.trim());
            if (Array.isArray(parsed)) {
              formattedResults.push(...parsed);
            } else if (parsed.Name || parsed.TotalPrice !== undefined) {
              formattedResults.push(parsed);
            }
          } catch (e) {
            // If not JSON, include as text for the agent to process
            formattedResults.push({ rawText: text });
          }
        }
      } catch (e) {
        // If parsing fails, include raw text
        formattedResults.push({ rawText: text });
      }
    }
    
    // If we have structured data, return it as JSON string
    if (formattedResults.length > 0 && (formattedResults[0].Name || formattedResults[0].TotalPrice !== undefined)) {
      return JSON.stringify(formattedResults, null, 2);
    }
    
    // Otherwise return the raw text results
    return results.map(r => r.content?.text || "").join("\n\n");
  } catch (error) {
    console.error("KB query error:", error);
    return "Unable to retrieve vendor history information at this time.";
  }
}

async function handleToolCall(toolName: string, toolInput: any) {
  switch (toolName) {
    case "search_vendor_history":
      const vendorHistoryKbId = process.env.VENDOR_HISTORY_KB_ID || "BVKIT12CIF";
      const results = await queryKnowledgeBase(vendorHistoryKbId, toolInput.query);
      
      // Parse results and provide summary
      try {
        let parsed: any;
        
        // Try to parse as JSON
        try {
          parsed = JSON.parse(results);
        } catch (e) {
          // If not JSON, try to extract JSON objects from the text
          const jsonMatches = results.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
            parsed = jsonMatches.map(m => {
              try {
                return JSON.parse(m);
              } catch {
                return null;
              }
            }).filter(Boolean);
          } else {
            // Return raw results if we can't parse
            return results || "No vendor history data found for this query.";
          }
        }
        
        // Ensure parsed is an array
        if (!Array.isArray(parsed)) {
          parsed = [parsed];
        }
        
        // Filter out items without Name or TotalPrice (likely not trip records)
        parsed = parsed.filter((item: any) => item && (item.Name || item.TotalPrice !== undefined));
        
        if (parsed.length === 0) {
          return results || "No vendor history data found for this query.";
        }
        
        // Calculate totals
        const totalPrice = parsed.reduce((sum: number, item: any) => {
          return sum + (parseFloat(item.TotalPrice) || 0);
        }, 0);
        
        // Group by vendor if Vendor_Name__c exists
        const vendorGroups: { [key: string]: any[] } = {};
        parsed.forEach((item: any) => {
          const vendorId = item.Vendor_Name__c || "No Vendor Assigned";
          if (!vendorGroups[vendorId]) {
            vendorGroups[vendorId] = [];
          }
          vendorGroups[vendorId].push(item);
        });
        
        let summary = `Found ${parsed.length} trip(s):\n\n`;
        
        // List trips
        parsed.forEach((item: any, index: number) => {
          summary += `${index + 1}. ${item.Name || "Unnamed Trip"}\n`;
          summary += `   Total Price: $${(item.TotalPrice || 0).toFixed(2)}\n`;
          if (item.Vendor_Name__c) {
            summary += `   Vendor ID: ${item.Vendor_Name__c}\n`;
          }
          if (item.CreatedDate) {
            const date = new Date(item.CreatedDate);
            summary += `   Created Date: ${date.toLocaleDateString()}\n`;
          }
          if (item.QuoteNumber) {
            summary += `   Quote Number: ${item.QuoteNumber}\n`;
          }
          summary += `\n`;
        });
        
        summary += `\nTotal Cost: $${totalPrice.toFixed(2)}\n`;
        
        // Show vendor breakdown if there are multiple vendors or user asked about vendors
        const uniqueVendors = Object.keys(vendorGroups).filter(v => v !== "No Vendor Assigned");
        if (uniqueVendors.length > 0) {
          summary += `\nVendor Breakdown:\n`;
          Object.entries(vendorGroups).forEach(([vendorId, trips]) => {
            const vendorTotal = trips.reduce((sum: number, t: any) => sum + (parseFloat(t.TotalPrice) || 0), 0);
            summary += `- ${vendorId}: ${trips.length} trip(s), Total: $${vendorTotal.toFixed(2)}\n`;
          });
        }
        
        return summary;
      } catch (e) {
        console.error("Error processing vendor history results:", e);
        // If parsing fails, return raw results
        return results || "No vendor history data found for this query.";
      }
      
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

            // Build system prompt
            const systemPrompt = buildSystemPrompt();
            
            const command = new ConverseStreamCommand({
              modelId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
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

