import { useEffect, useState, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

export function FilesModal({ kbId, onClose }: { kbId: string; onClose: () => void }) {
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 10

  useEffect(() => {
    async function loadFiles() {
      try {
        const res = await fetch(`/api/knowledge-bases/${kbId}/files`)
        const data = await res.json()
        setFiles(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error("Failed to load files:", err)
      } finally {
        setLoading(false)
      }
    }
    loadFiles()
  }, [kbId])

  const totalPages = Math.ceil(files.length / pageSize)

  const paginatedFiles = useMemo(() => {
    const start = (page - 1) * pageSize
    return files.slice(start, start + pageSize)
  }, [files, page])

  const handlePrev = () => setPage((p) => Math.max(p - 1, 1))
  const handleNext = () => setPage((p) => Math.min(p + 1, totalPages))

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Files in Knowledge Base</DialogTitle>
        </DialogHeader>

        {/* Scrollable area */}
        <div className="flex-1 overflow-y-auto mt-2 pr-1">
          {loading ? (
            <div className="space-y-2">
              {Array(3)
                .fill(0)
                .map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
            </div>
          ) : files.length ? (
            <ul className="space-y-2">
              {paginatedFiles.map((f) => (
                <li
                  key={f.id ?? f.name}
                  className="flex justify-between text-sm border-b pb-1"
                >
                  <span>{f.name ?? "Unnamed file"}</span>
                  <span className="text-muted-foreground">
                    {f.uploadedAt ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No files uploaded yet
            </p>
          )}
        </div>

        {/* Pagination controls */}
        {!loading && files.length > pageSize && (
          <div className="flex items-center justify-between mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={page === 1}
            >
              Previous
            </Button>

            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
