import { NextResponse } from "next/server"
import { BedrockAgentRuntimeClient, InvokeAgentCommand } from "@aws-sdk/client-bedrock-agent-runtime"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const startTime = Date.now()
  
  try {
    console.log(`[${requestId}] 📥 Bedrock Agent Request Started`)
    const { input, sessionId, mode, agentId: clientAgentId, alias: clientAlias } = await req.json()

    console.log(`[${requestId}] 📋 Request Details:`, {
      mode,
      sessionId: sessionId?.substring(0, 20) + "...",
      inputLength: input?.length || 0,
      inputPreview: input?.substring(0, 100) + (input?.length > 100 ? "..." : ""),
      hasClientAgentId: !!clientAgentId,
      hasClientAlias: !!clientAlias,
    })

    const region = process.env.AWS_REGION || "us-east-1"
    console.log(`[${requestId}] 🌍 Using AWS Region: ${region}`)

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

    console.log(`[${requestId}] 🤖 Agent Config:`, {
      mode,
      agentId: agentConfig.agentId?.substring(0, 10) + "...",
      aliasId: agentConfig.aliasId?.substring(0, 10) + "...",
      source: clientAgentId ? "client-provided" : "environment",
    })

    if (!agentConfig.agentId || !agentConfig.aliasId) {
      console.error(`[${requestId}] ❌ Missing Bedrock Agent configuration for mode: ${mode}`)
      return NextResponse.json(
        { error: "Missing Bedrock Agent configuration for selected mode." },
        { status: 400 },
      )
    }

    // --- 🧠 Initialize client --- //
    const client = new BedrockAgentRuntimeClient({ region })
    console.log(`[${requestId}] ✅ Bedrock Client Initialized`)

    // --- 📨 Create the command --- //
    const cmd = new InvokeAgentCommand({
      agentId: agentConfig.agentId,
      agentAliasId: agentConfig.aliasId,
      sessionId,
      inputText: input,
    })

    console.log(`[${requestId}] 🚀 Invoking Bedrock Agent...`)
    const invokeStartTime = Date.now()
    const res = await client.send(cmd)
    const invokeDuration = Date.now() - invokeStartTime
    console.log(`[${requestId}] ⏱️ Agent Invocation Took: ${invokeDuration}ms`)

    const decoder = new TextDecoder()
    let chunkCount = 0
    let totalBytes = 0

    // --- 🚀 Stream the response back to client --- //
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log(`[${requestId}] 📡 Starting response stream...`)
          const events = (res as any).completion ?? (res as any).outputStream
          if (!events) {
            console.error(`[${requestId}] ❌ No completion stream received from Bedrock Agent`)
            controller.enqueue("⚠️ No completion stream received from Bedrock Agent.")
            controller.close()
            return
          }

          for await (const event of events) {
            if (event?.chunk?.bytes) {
              chunkCount++
              const bytes = event.chunk.bytes
              totalBytes += bytes.length
              const text = decoder.decode(bytes, { stream: true })
              controller.enqueue(text)
              
              // Log every 10th chunk to avoid spam
              if (chunkCount % 10 === 0) {
                console.log(`[${requestId}] 📦 Stream Progress: ${chunkCount} chunks, ${totalBytes} bytes`)
              }
            }
          }
          
          const streamDuration = Date.now() - startTime
          console.log(`[${requestId}] ✅ Stream Complete:`, {
            totalChunks: chunkCount,
            totalBytes,
            totalDuration: `${streamDuration}ms`,
            avgChunkSize: chunkCount > 0 ? `${Math.round(totalBytes / chunkCount)} bytes` : "N/A",
          })
        } catch (err) {
          const errorDuration = Date.now() - startTime
          console.error(`[${requestId}] ❌ Stream error after ${errorDuration}ms:`, err)
          if (err instanceof Error) {
            console.error(`[${requestId}] Error Details:`, {
              message: err.message,
              stack: err.stack?.substring(0, 500),
            })
          }
          controller.enqueue("⚠️ Error while streaming agent response.")
        } finally {
          controller.close()
          const finalDuration = Date.now() - startTime
          console.log(`[${requestId}] 🏁 Request Complete: Total duration ${finalDuration}ms`)
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
    const errorDuration = Date.now() - startTime
    console.error(`[${requestId}] ❌ Agent invocation error after ${errorDuration}ms:`, err)
    if (err instanceof Error) {
      console.error(`[${requestId}] Error Details:`, {
        message: err.message,
        stack: err.stack?.substring(0, 500),
        name: err.name,
      })
    }
    return NextResponse.json({ error: "Agent invocation failed." }, { status: 500 })
  }
}
