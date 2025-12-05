import { NextResponse } from "next/server"
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const { input, sessionId, mode, agentId: clientAgentId, alias: clientAlias } = await req.json()

    const region = process.env.AWS_REGION || "us-west-2"

    // --- 🔁 Resolve agent config based on mode or client overrides --- //
    const agentConfig =
      mode === "retrieve"
        ? {
            agentId: clientAgentId || process.env.BEDROCK_RETRIEVE_AGENT_ID!,
            aliasId: clientAlias || process.env.BEDROCK_RETRIEVE_AGENT_ALIAS_ID!,
          }
        : {
            agentId: clientAgentId || process.env.BEDROCK_BOOKING_AGENT_ID!,
            aliasId: clientAlias || process.env.BEDROCK_BOOKING_AGENT_ALIAS_ID!,
          }

    if (!agentConfig.agentId || !agentConfig.aliasId) {
      return NextResponse.json(
        { error: "Missing Bedrock Agent configuration for selected mode." },
        { status: 400 },
      )
    }

    // --- 🧠 Initialize client --- //
    const client = new BedrockAgentRuntimeClient({ region })

    // --- 📨 Create the command --- //
    const cmd = new InvokeAgentCommand({
      agentId: agentConfig.agentId,
      agentAliasId: agentConfig.aliasId,
      sessionId,
      inputText: input,
    })

    const res = await client.send(cmd)
    const decoder = new TextDecoder()

    // --- 🚀 Stream the response back to client --- //
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const events = (res as any).completion ?? (res as any).outputStream
          if (!events) {
            controller.enqueue("⚠️ No completion stream received from Bedrock Agent.")
            controller.close()
            return
          }

          for await (const event of events) {
            if (event?.chunk?.bytes) {
              const text = decoder.decode(event.chunk.bytes, { stream: true })
              controller.enqueue(text)
            }
          }
        } catch (err) {
          console.error("❌ Stream error:", err)
          controller.enqueue("⚠️ Error while streaming agent response.")
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    console.error("❌ Agent invocation error:", err)
    return NextResponse.json({ error: "Agent invocation failed." }, { status: 500 })
  }
}
