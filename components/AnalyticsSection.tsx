"use client"

import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MessageSquare, Activity, Clock } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"

// ✅ Helper: shorten large numbers (1.2K, 3.4M)
function formatNumber(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return n.toString()
}

// ✅ Available filters
const FILTERS = ["Day", "Week", "Month"] as const
type FilterType = (typeof FILTERS)[number]

interface AnalyticsData {
  invocations: number
  inputTokens: number
  outputTokens: number
  avgLatency: number
}

export function AnalyticsSection() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [history, setHistory] = useState<{ date: string; count: number }[]>([])
  const [filter, setFilter] = useState<FilterType>("Day")

const fetchStats = async () => {
  const res = await fetch(`/api/analytics?range=${filter.toLowerCase()}`)
  const json = await res.json()

  // support both API shapes
  if (json.summary && json.history) {
    setData(json.summary)
    setHistory(json.history)
  } else {
    setData({
      invocations: json.invocations ?? 0,
      inputTokens: json.inputTokens ?? 0,
      outputTokens: json.outputTokens ?? 0,
      avgLatency: json.avgLatency ?? 0,
    })
    setHistory(
      json.history ??
        [{ date: new Date().toISOString().slice(0, 10), count: json.invocations ?? 0 }]
    )
  }
}

  useEffect(() => {
    fetchStats()
  }, [filter])

  if (!data) return <p>Loading analytics…</p>

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">
            Real-time usage stats (grouped per {filter.toLowerCase()})
          </p>
        </div>

        {/* ✅ Date range filter */}
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {/* ✅ Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">Invocations</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.invocations)}</div>
            <p className="text-xs text-muted-foreground">
              Total requests ({filter.toLowerCase()})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">Input Tokens</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.inputTokens)}</div>
            <p className="text-xs text-muted-foreground">Total tokens sent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">Output Tokens</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data.outputTokens)}</div>
            <p className="text-xs text-muted-foreground">Total tokens received</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">Avg. Latency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.avgLatency.toFixed(1)} ms</div>
            <p className="text-xs text-muted-foreground">Average response time</p>
          </CardContent>
        </Card>
      </div>

      {/* ✅ Chart area */}
      <Card>
        <CardHeader>
          <CardTitle>Invocations Trend</CardTitle>
          <p className="text-sm text-muted-foreground">
            {filter === "Day"
              ? "Last 24 hours"
              : filter === "Week"
              ? "Last 7 days"
              : "Last 30 days"}
          </p>
        </CardHeader>

        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value: number) => [formatNumber(value), "Invocations"]}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
