"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { KnowledgeBaseCard } from "./KnowledgeBaseCard"
import { useKnowledgeBase } from "./useKnowledgeBase"

export function KnowledgeBasesSection() {
  const { knowledgeBases = [], loadKBs, addKnowledgeBase, loading, status } = useKnowledgeBase()

  // ✅ Remove duplicates safely by ID
  const uniqueKnowledgeBases = knowledgeBases.filter(
    (kb, index, self) =>
      kb?.id && index === self.findIndex((k) => k?.id === kb?.id)
  )

  useEffect(() => {
    loadKBs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Connected Bedrock Knowledge Bases</h3>
          <p className="text-sm text-muted-foreground">
            {uniqueKnowledgeBases.length} knowledge base{uniqueKnowledgeBases.length !== 1 && "s"} connected
          </p>
        </div>

        <Button onClick={addKnowledgeBase} disabled={loading} className="gap-2">
          {loading ? "Updating..." : (
            <>
              <Plus className="h-4 w-4" />
              Add Knowledge Base
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {uniqueKnowledgeBases.map((kb) => (
          kb ? <KnowledgeBaseCard key={kb.id} kb={kb} /> : null
        ))}
      </div>

      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </div>
  )
}
