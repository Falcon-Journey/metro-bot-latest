import { NextResponse } from "next/server"
import {
  BedrockAgentClient,
  ListAgentKnowledgeBasesCommand,
  BedrockAgentClientConfig,
} from "@aws-sdk/client-bedrock-agent"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const region = process.env.AWS_REGION || "us-east-1"
    const agentIdsEnv = process.env.BEDROCK_AGENT_IDS || "QSSCWG19UJ"
    const agentVersionsEnv = process.env.BEDROCK_AGENT_VERSIONS || "5"

    if (!agentIdsEnv) throw new Error("Missing BEDROCK_AGENT_IDS in environment variables")
    if (!agentVersionsEnv) throw new Error("Missing BEDROCK_AGENT_VERSIONS in environment variables")

    const agentIds = agentIdsEnv.split(",").map((id) => id.trim())
    const agentVersions = agentVersionsEnv.split(",").map((v) => v.trim())

    if (agentIds.length !== agentVersions.length) {
      throw new Error("BEDROCK_AGENT_IDS and BEDROCK_AGENT_VERSIONS length mismatch")
    }

    // ✅ Properly typed AWS client configuration
    const config: BedrockAgentClientConfig = { region }
    const client = new BedrockAgentClient(config)
    const allKnowledgeBases: any[] = []

    for (let i = 0; i < agentIds.length; i++) {
      const agentId = agentIds[i]
      const agentVersion = agentVersions[i]

      try {
        const input = {
          agentId,
          agentVersion,
        }
        const command = new ListAgentKnowledgeBasesCommand(input)
        const response = await client.send(command)

        const knowledgeBases =
          response.agentKnowledgeBaseSummaries?.map((kb) => ({
            id: kb.knowledgeBaseId,
            // name: kb.name || "Unnamed Knowledge Base",
            type: kb.description || "Bedrock Knowledge Base",
            status: kb.knowledgeBaseState?.toLowerCase() || "unknown",
            lastSync: kb.updatedAt
              ? new Date(kb.updatedAt).toLocaleString()
              : "N/A",
          })) || []

        allKnowledgeBases.push(...knowledgeBases)
      } catch (err: any) {
        console.warn(`⚠️ Failed to fetch knowledge bases for agent ${agentId}:`, err.message)
      }
    }

    return NextResponse.json(allKnowledgeBases)
  } catch (err: any) {
    console.error("❌ Error fetching Bedrock Knowledge Bases:", err)
    return NextResponse.json(
      { error: "Failed to fetch Bedrock Knowledge Bases", details: err.message },
      { status: 500 }
    )
  }
}
