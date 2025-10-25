import { NextResponse } from "next/server"
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime"

export const dynamic = "force-dynamic" // ensure server runtime

function getEnv(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

export async function POST(req: Request) {
  console.log("🟢 [Booking API] Incoming request received")

  try {
    const body = await req.json()
    const { input, sessionId, mode } = body as {
      input?: string
      sessionId?: string
      mode?: "retrieve" | "booking"
    }

    console.log("📥 [Booking API] Parsed body:", body)

    if (!input || !input.trim()) {
      console.warn("⚠️ [Booking API] Invalid or empty input received.")
      return new NextResponse("Invalid input", { status: 400 })
    }

    const region = process.env.AWS_REGION || "us-west-2"
    const selectedMode = mode === "booking" ? "booking" : "retrieve"

    console.log(`🌎 [Booking API] Using region: ${region}`)
    console.log(`🔁 [Booking API] Mode selected: ${selectedMode}`)

    const agentId =
      selectedMode === "booking"
        ? getEnv("BEDROCK_BOOKING_AGENT_ID")
        : getEnv("BEDROCK_AGENT_ID")

    const agentAliasId =
      selectedMode === "booking"
        ? getEnv("BEDROCK_BOOKING_AGENT_ALIAS_ID")
        : getEnv("BEDROCK_AGENT_ALIAS_ID")

    console.log("🤖 [Booking API] Agent configuration:", {
      agentId,
      agentAliasId,
    })

    const client = new BedrockAgentRuntimeClient({ region })
    console.log("✅ [Booking API] BedrockAgentRuntimeClient initialized")

    const cmd = new InvokeAgentCommand({
      agentId,
      agentAliasId,
      sessionId: sessionId || undefined,
      inputText: input,
      enableTrace: false,
    })

    console.log("🚀 [Booking API] Invoking Bedrock Agent with:", {
      input,
      sessionId,
    })

    const res = await client.send(cmd)
    console.log("📦 [Booking API] Raw response received from Bedrock agent")

    let output = ""
    if (res.completion) {
      const decoder = new TextDecoder()
      for await (const event of res.completion as any) {
        if (event?.chunk?.bytes) {
          const textChunk = decoder.decode(event.chunk.bytes, { stream: true })
          output += textChunk
        }
      }
    }

    console.log("📝 [Booking API] Decoded agent output:", output || "(empty)")

    if (!output.trim()) {
      output = "The agent returned no content."
      console.warn("⚠️ [Booking API] Agent returned no content.")
    }

    console.log("✅ [Booking API] Returning JSON response to client")
    return NextResponse.json({ output })
  } catch (err: any) {
    console.error("❌ [Booking API] Error occurred:", err)

    const message =
      err?.message ||
      "Agent call failed. Ensure AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, BEDROCK_AGENT_ID/ALIAS_ID and BEDROCK_BOOKING_AGENT_ID/ALIAS_ID (for booking) are set."

    return new NextResponse(message, { status: 500 })
  }
}
