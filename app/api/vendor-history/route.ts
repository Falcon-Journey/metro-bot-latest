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

// Let AWS SDK resolve credentials from the environment/role (no custom AWS_* vars needed)
const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// Helper to create a Salesforce vendor link
function formatVendorLink(vendorId: string | null | undefined): string {
  if (!vendorId || vendorId === "null" || vendorId === "No Vendor Assigned") {
    return "No Vendor Assigned";
  }
  const cleanId = vendorId.toString().replace(/\|/g, "\\|");
  const url = `https://mshuttle.lightning.force.com/lightning/r/Account/${cleanId}/view`;
  return `[${cleanId}](${url})`;
}

// Simple CSV line parser that handles quoted fields with commas
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // Handle escaped quotes ("")
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((field) => field.trim().replace(/^"|"$/g, ""));
}

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
- When listing trips or pricing results, you MUST present them in a **markdown table** (not as bullet points or plain text)
- The primary trip table should use columns like: **Trip Name**, **Created Date**, **Quote #**, **Subtotal**, **Total Price**, **Vendor ID**
- When calculating totals, show a short text summary *after* the table (e.g., total cost, min/max/average) and, when appropriate, a separate **Vendor Breakdown** section
- If no results are found, clearly state that and suggest alternative search terms

TOOLS AVAILABLE:
- search_vendor_history: Search the knowledge base for trip and vendor information

CRITICAL FORMAT RULE:
- Whenever you need structured information about trips, vendors, or prices, you SHOULD call the tool \"search_vendor_history\" and then format the final answer as markdown tables as described above. Do NOT invent tables that don't align with the retrieved data.

VENDOR ID LINKING:
- Whenever a Vendor ID (Vendor_Name__c) is mentioned in your response, you MUST format it as a markdown hyperlink to Salesforce.
- Link format: [VENDOR_ID](https://mshuttle.lightning.force.com/lightning/r/Account/VENDOR_ID/view)
- Example: If vendor ID is \"001F0000018vHyNIAU\", display it as [001F0000018vHyNIAU](https://mshuttle.lightning.force.com/lightning/r/Account/001F0000018vHyNIAU/view)
- This applies to tables, vendor breakdowns, and any text where you mention a vendor ID.`;
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
        accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
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

    console.log("🔍 Vendor KB query", {
      kbId,
      query,
      resultCount: results.length,
    });
    
    // Parse and format the results
    const formattedResults: any[] = [];
    
    for (let idx = 0; idx < results.length; idx++) {
      const result = results[idx];
      const text = result.content?.text || "";
      if (!text) {
        console.log(`📄 KB result[${idx}] has no text content`);
        continue;
      }

      console.log(`📄 KB raw result[${idx}] (first 500 chars):`, text.slice(0, 500));

      const trimmed = text.trim();

      // --- CSV handling: detect and parse CSV with header row ---
      // Header can be either quoted or unquoted
      const isCsvHeader =
        trimmed.startsWith("Name,CreatedDate,OpportunityId") ||
        trimmed.startsWith('"Name","CreatedDate","OpportunityId"');

      if (isCsvHeader) {
        console.log("📑 Detected CSV format in KB result, parsing as CSV");
        const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length > 1) {
          const headerFields = parseCsvLine(lines[0]);

          for (let li = 1; li < lines.length; li++) {
            const rowLine = lines[li];
            const rowFields = parseCsvLine(rowLine);
            if (rowFields.length !== headerFields.length) {
              console.warn(
                `⚠️ CSV row ${li} field count (${rowFields.length}) != header count (${headerFields.length}), skipping row`
              );
              continue;
            }

            const record: any = {};
            headerFields.forEach((h, idxField) => {
              record[h] = rowFields[idxField];
            });

            // Normalize numeric fields
            if (record.Subtotal !== undefined && record.Subtotal !== null && record.Subtotal !== "null") {
              const n = Number(record.Subtotal);
              record.Subtotal = isNaN(n) ? record.Subtotal : n;
            }
            if (record.TotalPrice !== undefined && record.TotalPrice !== null && record.TotalPrice !== "null") {
              const n = Number(record.TotalPrice);
              record.TotalPrice = isNaN(n) ? record.TotalPrice : n;
            }

            formattedResults.push(record);
          }

          console.log(
            "✅ Parsed CSV records from KB result:",
            formattedResults.length,
            "current sample:",
            JSON.stringify(formattedResults[formattedResults.length - 1], null, 2)
          );
          // Done with this result; continue to next retrieval result
          continue;
        }
      }

      // --- JSON / raw text handling (existing logic) ---
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
            console.warn("⚠️ Failed to parse JSON fragment from KB result:", e);
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
            // If not JSON, include as text for the agent / model to process
            console.log("ℹ️ KB result could not be parsed as JSON, storing as rawText");
            formattedResults.push({ rawText: text });
          }
        }
      } catch (e) {
        // If parsing fails, include raw text
        console.error("❌ Error while parsing KB result text:", e);
        formattedResults.push({ rawText: text });
      }
    }
    
    console.log("✅ Vendor KB formattedResults count:", formattedResults.length);
    if (formattedResults.length > 0) {
      console.log("✅ Sample formattedResult[0]:", JSON.stringify(formattedResults[0], null, 2));
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
      const vendorHistoryKbId = process.env.VENDOR_HISTORY_KB_ID || "SDHWVT8JMB";
      const results = await queryKnowledgeBase(vendorHistoryKbId, toolInput.query);
      
      // Parse results and provide summary
      try {
        let parsed: any;
        
        // Try to parse as JSON
        try {
          parsed = JSON.parse(results);
        } catch (e) {
          console.warn("⚠️ Vendor history results not valid JSON, attempting to extract JSON fragments. Raw length:", results?.length);
          // If not JSON, try to extract JSON objects from the text
          const jsonMatches = results.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
            parsed = jsonMatches.map(m => {
              try {
                return JSON.parse(m);
              } catch {
                console.warn("⚠️ Failed to parse JSON fragment in vendor history results");
                return null;
              }
            }).filter(Boolean);
          } else {
            // Return raw results if we can't parse
            console.warn("⚠️ No JSON fragments found in vendor history results. Returning raw text to model.");
            return results || "No vendor history data found for this query.";
          }
        }
        
        // Ensure parsed is an array
        if (!Array.isArray(parsed)) {
          parsed = [parsed];
        }
        
        // Filter out items without Name or TotalPrice (likely not trip records)
        parsed = parsed.filter((item: any) => item && (item.Name || item.TotalPrice !== undefined));
        console.log("✅ Parsed vendor history records count:", parsed.length);
        if (parsed.length > 0) {
          console.log("✅ Sample parsed vendor record:", JSON.stringify(parsed[0], null, 2));
        }
        
        if (parsed.length === 0) {
          return results || "No vendor history data found for this query.";
        }
        
        // Calculate totals (ignore ShippingHandling as requested)
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
        
        // Build markdown table for trips
        // Columns: Name, Created Date, Quote #, Subtotal, Total Price, Vendor ID
        let table = "| Name | Created Date | Quote # | Subtotal | Total Price | Vendor ID |\n";
        table += "| --- | --- | --- | --- | --- | --- |\n";
        
        parsed.forEach((item: any) => {
          const name = (item.Name || "Unnamed Trip").toString().replace(/\|/g, "\\|");
          const createdDate = item.CreatedDate
            ? new Date(item.CreatedDate).toLocaleDateString()
            : "N/A";
          const quote = item.QuoteNumber ? item.QuoteNumber.toString().replace(/\|/g, "\\|") : "N/A";
          const subtotal = item.Subtotal !== undefined && item.Subtotal !== null
            ? `$${Number(item.Subtotal).toFixed(2)}`
            : "$0.00";
          const total = item.TotalPrice !== undefined && item.TotalPrice !== null
            ? `$${Number(item.TotalPrice).toFixed(2)}`
            : "$0.00";
          const vendorLink = formatVendorLink(item.Vendor_Name__c);
          
          table += `| ${name} | ${createdDate} | ${quote} | ${subtotal} | ${total} | ${vendorLink} |\n`;
        });
        
        // Ensure table ends with proper newline and add summary with clear separation
        let summary = `Found ${parsed.length} trip(s):\n\n${table}\n\n`;
        
        summary += `**Total Cost (all trips):** $${totalPrice.toFixed(2)}\n\n`;
        
        // Show vendor breakdown if there are multiple vendors or user asked about vendors
        const uniqueVendors = Object.keys(vendorGroups).filter(v => v !== "No Vendor Assigned");
        if (uniqueVendors.length > 0) {
          summary += `**Vendor Breakdown:**\n\n`;
          Object.entries(vendorGroups).forEach(([vendorId, trips]) => {
            const vendorTotal = trips.reduce((sum: number, t: any) => sum + (parseFloat(t.TotalPrice) || 0), 0);
            const vendorLink = formatVendorLink(vendorId);
            summary += `- ${vendorLink}: ${trips.length} trip(s), Total: $${vendorTotal.toFixed(2)}\n`;
          });
        }
        
        return summary.trim() + "\n";
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