"use client"

import { useEffect, useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { MessageSquare, Activity, Clock, DollarSign } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

interface AnalyticsData {
  invocations: number
  inputTokens: number
  outputTokens: number
  avgLatency: number
}

export function AnalyticsSection() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [history, setHistory] = useState<{ date: string; count: number }[]>([])

  const fetchStats = async () => {
    const res = await fetch("/api/analytics")
    const json = await res.json()
    setData(json)
    // For demo: append to history
    setHistory((h) => [
      ...h.slice(-19),
      { date: new Date().toISOString().slice(11,19), count: json.invocations },
    ])
  }

  useEffect(() => {
    fetchStats()
    const timer = setInterval(fetchStats, 10 * 1000)  // every 10 seconds
    return () => clearInterval(timer)
  }, [])

  if (!data) return <p>Loading analytics…</p>

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
        <p className="text-muted-foreground">Real-time usage stats from Bedrock / CloudWatch</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">Invocations</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.invocations.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Requests (last window)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">Input Tokens</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.inputTokens.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Tokens sent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">Output Tokens</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.outputTokens.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Tokens received</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">Avg Latency (ms)</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.avgLatency.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">Milliseconds</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invocations Over Time</CardTitle>
        </CardHeader>
        <CardContent className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history}>
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
