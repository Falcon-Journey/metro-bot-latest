import { useState } from "react"
import { Button } from "@/components/ui/button"
import { MoreVertical } from "lucide-react"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { FilesModal } from "./FilesModal"
import { UploadModal } from "./UploadModal"

export function KnowledgeBaseMenu({ kbId }: { kbId: string }) {
  const [viewFiles, setViewFiles] = useState(false)
  const [uploadFiles, setUploadFiles] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setViewFiles(true)}>View Files</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setUploadFiles(true)}>Upload Files</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {viewFiles && <FilesModal kbId={kbId} onClose={() => setViewFiles(false)} />}
      {uploadFiles && <UploadModal kbId={kbId} onClose={() => setUploadFiles(false)} />}
    </>
  )
}
