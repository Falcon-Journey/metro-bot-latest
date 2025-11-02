import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

export function FilesModal({ kbId, onClose }: { kbId: string, onClose: () => void }) {
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFiles() {
      try {
        const res = await fetch(`/api/knowledge-bases/${kbId}/files`)
        const data = await res.json()
        setFiles(data)
      } finally {
        setLoading(false)
      }
    }
    loadFiles()
  }, [kbId])

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Files in Knowledge Base</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : files.length ? (
          <ul className="space-y-2">
            {files.map(f => (
              <li key={f.id} className="flex justify-between text-sm border-b pb-1">
                <span>{f.name}</span>
                <span className="text-muted-foreground">{f.uploadedAt}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No files uploaded yet</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
