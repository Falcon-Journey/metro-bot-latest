import { NextResponse } from "next/server"
import {
  CloudWatchClient,
  GetMetricDataCommand,
  MetricDataQuery,
} from "@aws-sdk/client-cloudwatch"

export const dynamic = "force-dynamic"

const region = process.env.AWS_REGION || "us-west-2"
const cw = new CloudWatchClient({ region })

async function queryMetrics(): Promise<any> {
  const now = Date.now()
const start = now - 30 * 24 * 60 * 60 * 1000 // last 30 days
  const end = now

  const metrics: MetricDataQuery[] = [
    {
      Id: "invocations",
      MetricStat: {
        Metric: {
          Namespace: "AWS/Bedrock",
          MetricName: "Invocations",
        },
        Period: 60,
        Stat: "Sum",
      },
      ReturnData: true,
    },
    {
      Id: "inputTokens",
      MetricStat: {
        Metric: {
          Namespace: "AWS/Bedrock",
          MetricName: "InputTokenCount",
        },
        Period: 60,
        Stat: "Sum",
      },
      ReturnData: true,
    },
    {
      Id: "outputTokens",
      MetricStat: {
        Metric: {
          Namespace: "AWS/Bedrock",
          MetricName: "OutputTokenCount",
        },
        Period: 60,
        Stat: "Sum",
      },
      ReturnData: true,
    },
    {
      Id: "latency",
      MetricStat: {
        Metric: {
          Namespace: "AWS/Bedrock",
          MetricName: "InvocationLatency",
        },
        Period: 60,
        Stat: "Average",
      },
      ReturnData: true,
    },
  ]

  console.log("🔍 Querying CloudWatch metrics", {
    region,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    metrics: metrics.map((m) => m.Id),
  })

  const cmd = new GetMetricDataCommand({
    StartTime: new Date(start),
    EndTime: new Date(end),
    MetricDataQueries: metrics,
  })

  const resp = await cw.send(cmd)
  console.log("📊 Raw CloudWatch response:", JSON.stringify(resp, null, 2))

  return resp
}

export async function GET() {
  try {
    console.log("🚀 Analytics API triggered")

    const data = await queryMetrics()

    const result: any = {
      invocations: 0,
      inputTokens: 0,
      outputTokens: 0,
      avgLatency: 0,
    }

    for (const m of data.MetricDataResults || []) {
      const { Id, Values, Label } = m
      const sum = (Values || []).reduce((a: number, b: number) => a + b, 0)

      console.log(`🧮 Metric: ${Label || Id} | Points: ${Values?.length || 0} | Sum: ${sum}`)

      if (Id === "invocations") result.invocations = sum
      if (Id === "inputTokens") result.inputTokens = sum
      if (Id === "outputTokens") result.outputTokens = sum
      if (Id === "latency") {
        const count = (Values || []).length
        result.avgLatency = count ? sum / count : 0
      }
    }

    console.log("✅ Parsed Analytics Result:", result)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("❌ Analytics error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
