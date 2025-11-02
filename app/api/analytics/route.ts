import { NextResponse } from "next/server"
import {
  CloudWatchClient,
  GetMetricDataCommand,
  MetricDataQuery,
} from "@aws-sdk/client-cloudwatch"

export const dynamic = "force-dynamic"

const region = process.env.AWS_REGION || "us-west-2"
const cw = new CloudWatchClient({ region })

async function queryMetrics(range: string): Promise<any> {
  const now = Date.now()
  let start: number
  let period: number // seconds per datapoint

  // 🕒 Adjust query window & granularity
  switch (range) {
    case "day":
      start = now - 24 * 60 * 60 * 1000 // 1 day
      period = 300 // 5 min resolution
      break
    case "week":
      start = now - 7 * 24 * 60 * 60 * 1000 // 7 days
      period = 3600 // 1 hour
      break
    case "month":
      start = now - 30 * 24 * 60 * 60 * 1000 // 30 days
      period = 6 * 3600 // 6 hours
      break
    default:
      start = now - 30 * 24 * 60 * 60 * 1000
      period = 3600
  }

  const metrics: MetricDataQuery[] = [
    {
      Id: "invocations",
      MetricStat: {
        Metric: {
          Namespace: "AWS/Bedrock",
          MetricName: "Invocations",
        },
        Period: period,
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
        Period: period,
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
        Period: period,
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
        Period: period,
        Stat: "Average",
      },
      ReturnData: true,
    },
  ]

  console.log("🔍 Querying CloudWatch", {
    range,
    region,
    start: new Date(start).toISOString(),
    end: new Date(now).toISOString(),
    period,
  })

  const cmd = new GetMetricDataCommand({
    StartTime: new Date(start),
    EndTime: new Date(now),
    MetricDataQueries: metrics,
  })

  const resp = await cw.send(cmd)
  return resp
}

export async function GET(req: Request) {
  try {
    console.log("🚀 Analytics API triggered")

    const url = new URL(req.url)
    const range = url.searchParams.get("range") || "month"

    const data = await queryMetrics(range)

    const result: any = {
      summary: {
        invocations: 0,
        inputTokens: 0,
        outputTokens: 0,
        avgLatency: 0,
      },
      history: [],
    }

    const timeStamps: Record<string, string[]> = {}

    for (const m of data.MetricDataResults || []) {
      const { Id, Values = [], Timestamps = [] } = m
      const sum = Values.reduce((a:any, b:any) => a + b, 0)

      if (Id === "invocations") result.summary.invocations = sum
      if (Id === "inputTokens") result.summary.inputTokens = sum
      if (Id === "outputTokens") result.summary.outputTokens = sum
      if (Id === "latency") {
        const count = Values.length
        result.summary.avgLatency = count ? sum / count : 0
      }

      // Build history for chart (only for invocations)
      if (Id === "invocations") {
        const points = Timestamps.map((t: any, i :any) => ({
          date: new Date(t).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: range === "day" ? "2-digit" : undefined,
          }),
          count: Values[i],
        }))
        result.history = points.sort(
          (a :any, b : any) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
      }
    }

    console.log("✅ Parsed Analytics Result:", result)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error("❌ Analytics error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
