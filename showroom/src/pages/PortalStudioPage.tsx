import { PageIntro } from '../components/PageIntro'
import { PortalStudioWorkbench } from '../components/PortalStudioWorkbench'

export function PortalStudioPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Portal Studio"
        title="Inspect a company, choose modules, and build the client portal over time."
        description="Portal Studio turns the client&apos;s inboxes, sheets, docs, exports, and approvals into a concrete portal plan. Use it to see what data we inspect, which modules go live first, who gets access, and what expands next."
      />
      <PortalStudioWorkbench />
    </div>
  )
}
