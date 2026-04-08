import { PageIntro } from '../components/PageIntro'
import { PortalStudioWorkbench } from '../components/PortalStudioWorkbench'

export function PortalStudioPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Studio"
        title="Plan the next workspace or portal from inside HQ."
        description="Use Studio to review the company, pick the first module, map data and access, and hand a rollout plan to the team."
      />
      <PortalStudioWorkbench />
    </div>
  )
}
