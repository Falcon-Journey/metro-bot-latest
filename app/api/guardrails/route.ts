import { NextResponse } from "next/server"
import {
  BedrockAgentClient,
  GetAgentCommand,
} from "@aws-sdk/client-bedrock-agent"
import {
  BedrockClient,
  GetGuardrailCommand,
} from "@aws-sdk/client-bedrock"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const region = process.env.AWS_REGION || "us-east-1"
    const agentIdsEnv = process.env.BEDROCK_AGENT_IDS || "QSSCWG19UJ"
    const agentVersionsEnv = process.env.BEDROCK_AGENT_VERSIONS || "5"

    if (!agentIdsEnv)
      throw new Error("Missing BEDROCK_AGENT_IDS in environment variables")

    const agentIds = agentIdsEnv.split(",").map((id) => id.trim())
    const agentVersions = agentVersionsEnv
      ? agentVersionsEnv.split(",").map((v) => v.trim())
      : []

    const agentClient = new BedrockAgentClient({ region })
    const bedrockClient = new BedrockClient({ region })

    console.log(`🔍 Fetching guardrails for agents: ${agentIds.join(", ")}`)

    // 🧠 Fetch all agents in parallel
    const results = await Promise.all(
      agentIds.map(async (agentId, index) => {
        try {
          const version =
            agentVersions[index] || "DRAFT" // fallback if not provided

          console.log(`➡️ Fetching agent ${agentId} (version: ${version})`)
          const agentResp = await agentClient.send(
            new GetAgentCommand({
              agentId,
            })
          )

          const guardrailConfig = agentResp.agent?.guardrailConfiguration
          if (!guardrailConfig?.guardrailIdentifier) {
            console.warn(`⚠️ No guardrail linked to agent ${agentId}`)
            return null
          }

          console.log(
            `🔗 Agent ${agentId} linked to guardrail ${guardrailConfig.guardrailIdentifier} (v${guardrailConfig.guardrailVersion})`
          )

          // Fetch guardrail details
          const guardrailResp = await bedrockClient.send(
            new GetGuardrailCommand({
              guardrailIdentifier: guardrailConfig.guardrailIdentifier,
              guardrailVersion: guardrailConfig.guardrailVersion,
            })
          )

          return {
            id: guardrailResp.guardrailId,
            name: guardrailResp.name || "Unnamed Guardrail",
            description: guardrailResp.description || "No description provided.",
            version: guardrailResp.version || guardrailConfig.guardrailVersion,
            status: guardrailResp.status || "UNKNOWN",
            updatedAt: guardrailResp.updatedAt
              ? new Date(guardrailResp.updatedAt).toISOString()
              : null,
            linkedAgent: {
              id: agentId,
              version,
            },
          }
        } catch (err: any) {
          console.error(`❌ Error fetching guardrail for agent ${agentId}:`, err)
          return {
            id: null,
            name: `Error loading guardrail for agent ${agentId}`,
            description: err.message || "Unknown error",
            status: "ERROR",
            version: null,
            linkedAgent: {
              id: agentId,
              version: agentVersions[index] || "DRAFT",
            },
          }
        }
      })
    )

    // Filter out nulls (agents without guardrails)
    const validGuardrails = results.filter(Boolean)

    if (validGuardrails.length === 0) {
      return NextResponse.json([], { status: 200 })
    }

    return NextResponse.json(validGuardrails, { status: 200 })
  } catch (err: any) {
    console.error("❌ Error fetching multiple guardrails:", err)
    return NextResponse.json(
      { error: "Failed to fetch guardrails", details: err.message },
      { status: 500 }
    )
  }
}
