import { NextResponse } from "next/server"
import {
  BedrockClient,
  GetGuardrailCommand,
  UpdateGuardrailCommand,
} from "@aws-sdk/client-bedrock"

export const dynamic = "force-dynamic"

const region = process.env.AWS_REGION || "us-east-1"
const client = new BedrockClient({ region })

// 🧠 Get Guardrail Details
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const command = new GetGuardrailCommand({ guardrailIdentifier: params.id })
    const response = await client.send(command)

    return NextResponse.json({
    //   id: response.id,
      name: response.name,
      description: response.description,
      status: response.status,
      version: response.version,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      contentPolicy: response.contentPolicy,
      sensitiveInformationPolicy: response.sensitiveInformationPolicy,
      topicPolicy: response.topicPolicy,
    })
  } catch (err: any) {
    console.error("❌ Error fetching guardrail details:", err)
    return NextResponse.json(
      { error: "Failed to fetch guardrail details", details: err.message },
      { status: 500 }
    )
  }
}
