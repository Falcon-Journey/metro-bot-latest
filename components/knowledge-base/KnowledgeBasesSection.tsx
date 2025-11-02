"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus } from "lucide-react"
import { KnowledgeBaseCard } from "./KnowledgeBaseCard"
import { useKnowledgeBase } from "./useKnowledgeBase"

export function KnowledgeBasesSection() {
  const { knowledgeBases, loadKBs, addKnowledgeBase, loading, status } = useKnowledgeBase()

  useEffect(() => { loadKBs() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Connected Bedrock Knowledge Bases</h3>
          <p className="text-sm text-muted-foreground">
            {knowledgeBases.length} knowledge bases connected
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
        {knowledgeBases.map((kb) => (
          <KnowledgeBaseCard key={kb.id} kb={kb} />
        ))}
      </div>

      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </div>
  )
}
