import { NextResponse } from "next/server"
import {
  BedrockClient,
  BedrockClientConfig,
  ListGuardrailsCommand,
} from "@aws-sdk/client-bedrock"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const region = process.env.AWS_REGION || "us-west-2"
    const agentIdsEnv = process.env.BEDROCK_AGENT_IDS
    const agentVersionsEnv = process.env.BEDROCK_AGENT_VERSIONS

    if (!agentIdsEnv) throw new Error("Missing BEDROCK_AGENT_IDS in environment variables")
    if (!agentVersionsEnv) throw new Error("Missing BEDROCK_AGENT_VERSIONS in environment variables")

    const agentIds = agentIdsEnv.split(",").map((id) => id.trim())
    const agentVersions = agentVersionsEnv.split(",").map((v) => v.trim())

    if (agentIds.length !== agentVersions.length) {
      throw new Error("BEDROCK_AGENT_IDS and BEDROCK_AGENT_VERSIONS length mismatch")
    }

    // ✅ Use BedrockClient for Guardrails
    const config: BedrockClientConfig = { region }
    const client = new BedrockClient(config)

    // Fetch all guardrails in the account
    const command = new ListGuardrailsCommand({})
    const response = await client.send(command)

    const allGuardrails =
      response.guardrails?.map((gr) => ({
        id: gr.id,
        name: gr.name || "Unnamed Guardrail",
        description: gr.description || "",
        status: gr.status?.toLowerCase() || "unknown",
        version: gr.version || "N/A",
        lastModified: gr.updatedAt
          ? new Date(gr.updatedAt).toLocaleString()
          : "N/A",
      })) || []

    // ✅ Optional: Filter by agent ID if your naming scheme uses agent identifiers
    const filteredGuardrails = allGuardrails.filter((gr) =>
      agentIds.some((id) =>
        gr.name?.toLowerCase().includes(id.toLowerCase())
      )
    )

    return NextResponse.json(filteredGuardrails.length ? filteredGuardrails : allGuardrails)
  } catch (err: any) {
    console.error("❌ Error fetching Bedrock Guardrails:", err)
    return NextResponse.json(
      { error: "Failed to fetch Bedrock Guardrails", details: err.message },
      { status: 500 }
    )
  }
}
