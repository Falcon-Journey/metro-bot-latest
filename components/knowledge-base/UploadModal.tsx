"use client"

import { useRef, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { UploadCloud, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"

export function UploadModal({ kbId, onClose }: { kbId: string; onClose: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<boolean | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setUploadSuccess(null)
    }
  }

  const triggerFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.warning("⚠️ Please select a file first")
      return
    }

    setUploading(true)
    setUploadSuccess(null)

    try {
      const formData = new FormData()
      formData.append("file", selectedFile)

      const res = await fetch(`/api/knowledge-bases/${kbId}/files`, {
        method: "POST",
        body: formData,
      })

      const result = await res.json()

      if (res.ok && result.success) {
        setUploadSuccess(true)
        toast.success(`✅ ${selectedFile.name} uploaded successfully!`)
        setSelectedFile(null)
      } else {
        setUploadSuccess(false)
        toast.error(`❌ Upload failed: ${result.error || "Unknown error"}`)
      }
    } catch (err) {
      setUploadSuccess(false)
      toast.error("❌ Network error while uploading file.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md space-y-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Upload File</DialogTitle>
        </DialogHeader>

        {!uploading ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-xl p-6 hover:bg-muted/20 transition-colors">
            <UploadCloud className="h-10 w-10 text-primary mb-2" />
            <p className="text-sm text-muted-foreground mb-2 text-center">
              {selectedFile ? (
                <span className="font-medium text-foreground">{selectedFile.name}</span>
              ) : (
                "Choose a file to upload to your knowledge base"
              )}
            </p>

            <div className="flex gap-3 mt-2">
              <Button variant="outline" type="button" onClick={triggerFilePicker}>
                Choose File
              </Button>

              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="bg-primary text-white"
              >
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </div>

            {/* Hidden input trigger */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <p className="text-sm text-muted-foreground animate-pulse">
              Uploading <span className="font-medium">{selectedFile?.name}</span>...
            </p>
          </div>
        )}

        {uploadSuccess !== null && !uploading && (
          <div
            className={`flex items-center gap-2 text-sm ${
              uploadSuccess
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {uploadSuccess ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {uploadSuccess ? "File uploaded successfully!" : "Upload failed."}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
