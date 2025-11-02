"use client"

import { useState } from "react"

export function useKnowledgeBase() {
  const [knowledgeBases, setKnowledgeBases] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("")

  /**
   * Load all connected knowledge bases
   */
  async function loadKBs() {
    setLoading(true)
    try {
      const res = await fetch("/api/knowledge-bases")
      if (!res.ok) throw new Error("Failed to fetch KBs")
      const data = await res.json()
      setKnowledgeBases(data)
    } catch (err) {
      console.error("Error loading KBs:", err)
      setStatus("❌ Failed to load knowledge bases.")
    } finally {
      setLoading(false)
    }
  }

  /**
   * Create a new S3-type Bedrock knowledge base
   */
  async function addKnowledgeBase() {
    setLoading(true)
    setStatus("⚙️ Creating new Knowledge Base and linking S3...")

    try {
      // This endpoint should handle both KB creation and S3 linking
      const res = await fetch("/api/knowledge-bases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "S3" }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setStatus("✅ Knowledge Base created and linked to S3 successfully!")
        await loadKBs()
      } else {
        setStatus(`❌ Error: ${data.error || "Failed to create KB"}`)
      }
    } catch (err) {
      console.error("Error creating KB:", err)
      setStatus("❌ Network error while creating Knowledge Base.")
    } finally {
      setLoading(false)
    }
  }

  return {
    knowledgeBases,
    loadKBs,
    addKnowledgeBase,
    loading,
    status,
  }
}
