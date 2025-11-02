import { Card } from "@/components/ui/card"
import { Construction } from "lucide-react"

interface ComingSoonSectionProps {
  section: string
}

export function ComingSoonSection({ section }: ComingSoonSectionProps) {
  return (
    <Card className="p-12">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="rounded-full bg-muted p-6">
          <Construction className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="mt-6 text-xl font-semibold text-foreground">Coming Soon</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {section} functionality is currently under development. Check back soon for updates.
        </p>
      </div>
    </Card>
  )
}
