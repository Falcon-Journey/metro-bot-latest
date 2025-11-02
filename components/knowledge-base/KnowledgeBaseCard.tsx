import { Card } from "@/components/ui/card"
import { FileText } from "lucide-react"
import { KnowledgeBaseMenu } from "./KnowledgeBaseMenu"
import { Badge } from "@/components/ui/badge"

export function KnowledgeBaseCard({ kb }: { kb: any }) {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-primary/10 p-3">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h4 className="font-medium">{kb.name}</h4>
            <p className="text-sm text-muted-foreground">{kb.type}</p>
          </div>
        </div>

        <KnowledgeBaseMenu kbId={kb.id} />
      </div>

      <div className="text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last updated</span>
          <span className="font-medium">{kb.lastSync}</span>
        </div>
        <Badge
          variant={kb.status === "active" ? "default" : "secondary"}
          className={
            kb.status === "active"
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
          }
        >
          {kb.status}
        </Badge>
      </div>
    </Card>
  )
}
