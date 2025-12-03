"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Copy, Check, Send, ChevronDown, ChevronUp } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export function ApisSection() {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [copiedCurl, setCopiedCurl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [request, setRequest] = useState(`{
  "input": "Hello, how can you help me?",
  "mode": "retrieve"
}`)
  const [response, setResponse] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [showMore, setShowMore] = useState(false)

  const [sessionId] = useState(() => {
    const existing = localStorage.getItem("bedrock-session-id")
    if (existing) return existing
    const newId = `session-${crypto.randomUUID()}`
    localStorage.setItem("bedrock-session-id", newId)
    return newId
  })

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin)
    }
  }, [])

  // Define all endpoints
  const allApis = [
    {
      name: "List Knowledge Bases",
      path: "/api/knowledge-bases",
      method: "GET",
      description: "Fetch all knowledge bases configured in your account.",
    },
    {
      name: "Create Knowledge Base (S3)",
      path: "/api/knowledge-bases/kb/create",
      method: "POST",
      description: "Create and link a new S3-based Knowledge Base.",
      exampleBody: `{ "type": "S3" }`,
    },
    {
      name: "Upload File to KB",
      path: "/api/knowledge-bases/:kbId/files",
      method: "POST",
      description: "Upload a file to the specified Knowledge Base.",
      exampleBody: `{ "file": "<binary>" }`,
    },
    {
      name: "List Guardrails",
      path: "/api/guardrails",
      method: "GET",
      description: "List all active guardrails from AWS Bedrock.",
    },
  ]

  const bedrockApi = {
    name: "Bedrock Agent Invocation",
    path: "/api/bedrock-chat",
    method: "POST",
    description: "Send a request to your Bedrock Agent and stream its response.",
    exampleBody: `{
  "input": "Hello!",
  "mode": "retrieve",
  "sessionId": "<session-id>"
}`,
  }

  const copyToClipboard = async (text: string, type: "url" | "curl", id: string) => {
    await navigator.clipboard.writeText(text)
    if (type === "url") {
      setCopiedUrl(id)
      setTimeout(() => setCopiedUrl(null), 2000)
    } else {
      setCopiedCurl(id)
      setTimeout(() => setCopiedCurl(null), 2000)
    }
  }

  // 🔥 Live Bedrock test
  const handleTestRequest = async () => {
    const api = `${baseUrl}${bedrockApi.path}`
    setLoading(true)
    setResponse("")

    try {
      const payload = { ...JSON.parse(request), sessionId }
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await res.text())

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ""
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        fullText += chunk
        setResponse(fullText)
      }
    } catch (err: any) {
      setResponse(`❌ Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const renderApiCard = (api: any) => {
    const fullUrl = `${baseUrl}${api.path}`
    const curlCmd =
      api.method === "GET"
        ? `curl -X GET "${fullUrl}"`
        : `curl -X ${api.method} "${fullUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${api.exampleBody || "{}"}'`

    return (
      <Card key={api.path} className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{api.name}</CardTitle>
          <CardDescription>{api.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-sm break-all">{fullUrl}</div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(fullUrl, "url", api.path)}
            >
              {copiedUrl === api.path ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto">
            <pre>{curlCmd}</pre>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(curlCmd, "curl", api.path)}
          >
            {copiedCurl === api.path ? (
              <Check className="mr-2 h-4 w-4 text-green-500" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            Copy curl
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold">API Reference</h2>
        <p className="text-muted-foreground">
          Use these APIs to integrate or test your Bedrock system. You can copy URLs or run cURL
          commands directly in Postman or CLI.
        </p>
      </div>

      {/* Always visible Bedrock API */}
      {renderApiCard(bedrockApi)}

      {/* Bedrock live demo */}
      <Card>
        <CardHeader>
          <CardTitle>🔄 Live Bedrock Agent Demo</CardTitle>
          <CardDescription>Send a request and stream the response below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Label>Request Body</Label>
          <Textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            className="font-mono text-sm min-h-[200px]"
          />
          <Button onClick={handleTestRequest} disabled={loading} className="w-full">
            {loading ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Request
              </>
            )}
          </Button>

          <Label>Response (streamed)</Label>
          <Textarea
            value={response}
            readOnly
            className="font-mono text-sm min-h-[200px] bg-muted"
            placeholder="Response will appear here..."
          />
        </CardContent>
      </Card>

      {/* Collapsible section */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={() => setShowMore(!showMore)}
          className="flex items-center gap-2"
        >
          {showMore ? (
            <>
              <ChevronUp className="h-4 w-4" />
              Hide Other APIs
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Show More APIs
            </>
          )}
        </Button>
      </div>

      {/* Conditionally render other APIs */}
      {showMore && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {allApis.map((api) => renderApiCard(api))}
        </div>
      )}
    </div>
  )
}
