"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Shield, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
// import { Switch } from "@/components/ui/switch" // temporarily commented out

interface Guardrail {
  id: string
  name: string
  description: string
  status: string
  enabled: boolean
}

export function GuardrailsSection() {
  const [guardrails, setGuardrails] = useState<Guardrail[]>([])
  const [loading, setLoading] = useState(true)
  const [newKeyword, setNewKeyword] = useState("")
  const [newMessage, setNewMessage] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)

  const [selectedGuardrail, setSelectedGuardrail] = useState<any>(null)
  const [details, setDetails] = useState<any>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // ✅ Fetch guardrails from API
  useEffect(() => {
    const fetchGuardrails = async () => {
      try {
        const res = await fetch("/api/guardrails")
        const data = await res.json()
        const formatted = data.map((g: any) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          status: g.status,
          enabled: g.status === "active",
        }))
        setGuardrails(formatted)
      } catch (err) {
        console.error("❌ Error loading guardrails:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchGuardrails()
  }, [])

  // 🧠 View Details
  const openGuardrailDetails = async (g: Guardrail) => {
    setSelectedGuardrail(g)
    setDetails(null)
    setDetailsLoading(true)
    try {
      const res = await fetch(`/api/guardrails/${g.id}`)
      const data = await res.json()
      setDetails(data)
    } catch (err) {
      console.error("❌ Failed to load details:", err)
      setDetails({ error: "Failed to load details." })
    } finally {
      setDetailsLoading(false)
    }
  }

  const closeDetails = () => {
    setSelectedGuardrail(null)
    setDetails(null)
  }

  // 🚫 Enable/Disable Temporarily Commented Out
  /*
  const toggleGuardrail = (id: string) => {
    setGuardrails((prev) =>
      prev.map((g) => (g.id === id ? { ...g, enabled: !g.enabled } : g))
    )
  }
  */

  const deleteGuardrail = (id: string) => {
    setGuardrails((prev) => prev.filter((g) => g.id !== id))
  }

  const addGuardrail = () => {
    if (!newKeyword.trim() || !newMessage.trim()) return
    const newGuardrail: Guardrail = {
      id: Date.now().toString(),
      name: newKeyword.trim(),
      description: newMessage.trim(),
      status: "custom",
      enabled: true,
    }
    setGuardrails((prev) => [...prev, newGuardrail])
    setNewKeyword("")
    setNewMessage("")
    setShowAddForm(false)
  }

  // 🌀 Loading State
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading guardrails...</p>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-foreground">Active Guardrails</h3>
          <p className="text-sm text-muted-foreground">Fetched from AWS Bedrock</p>
        </div>
        <Button onClick={() => setShowAddForm(!showAddForm)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Guardrail
        </Button>
      </div>

      {/* Add Guardrail Form */}
      {showAddForm && (
        <Card className="border-border bg-card p-6">
          <h4 className="mb-4 text-base font-medium text-card-foreground">New Guardrail</h4>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="keyword">Keyword or Name</Label>
              <Input
                id="keyword"
                placeholder="e.g., profanity"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Description or Message</Label>
              <Input
                id="message"
                placeholder="e.g., Keep language respectful"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={addGuardrail}>Add</Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Guardrails List */}
      <div className="space-y-3">
        {guardrails.map((guardrail) => (
          <Card key={guardrail.id} className="border-border bg-card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <h4 className="font-medium text-card-foreground">{guardrail.name}</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      guardrail.enabled
                        ? "bg-green-500/10 text-green-600 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {guardrail.enabled ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{guardrail.description}</p>
              </div>

              <div className="flex items-center gap-3">
                {/* <Switch checked={guardrail.enabled} onCheckedChange={() => toggleGuardrail(guardrail.id)} /> */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openGuardrailDetails(guardrail)}
                  className="gap-1"
                >
                  <Eye className="h-4 w-4" /> View
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteGuardrail(guardrail.id)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {guardrails.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-12">
          <Shield className="mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No guardrails found for configured agents</p>
        </div>
      )}

      {/* 🧩 Guardrail Details Modal */}
{selectedGuardrail && (
  <Dialog open={!!selectedGuardrail} onOpenChange={closeDetails}>
    <DialogContent
      className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col rounded-2xl"
    >
      <DialogHeader className="sticky top-0 bg-background border-b pb-3 z-10">
        <DialogTitle className="text-lg font-semibold">
          {selectedGuardrail.name}
        </DialogTitle>
      </DialogHeader>

      <div className="overflow-y-auto px-1.5 pr-3 py-4 space-y-4 text-sm">
        {detailsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : details?.error ? (
          <p className="text-sm text-red-500">{details.error}</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p>
                <strong>Status:</strong> {details?.status || "unknown"}
              </p>
              <p>
                <strong>Version:</strong> {details?.version || "N/A"}
              </p>
              <p>
                <strong>Last Updated:</strong>{" "}
                {details?.updatedAt
                  ? new Date(details.updatedAt).toLocaleString()
                  : "N/A"}
              </p>
            </div>

            <div>
              <strong>Description:</strong>
              <p className="mt-1 text-muted-foreground">
                {details?.description || "No description available."}
              </p>
            </div>

            {details?.contentPolicy && (
              <div>
                <strong>Content Policy:</strong>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto mt-2 border border-border">
                  {JSON.stringify(details.contentPolicy, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-background border-t pt-3 flex justify-end mt-auto">
        <Button variant="secondary" onClick={closeDetails}>
          Close
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)}
    </div>
  )
}
