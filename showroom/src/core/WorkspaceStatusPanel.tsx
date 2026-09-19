import { useMemo } from 'react'
import { Link } from 'react-router'
import { loadCommerceWorkspace } from './commerce-workspace'
import { buildOperationalReport } from './operational-report'
import { loadWebsiteWorkspace } from '../products/website/website-model'

const MAX_SHOWN = 6

function snapshotReport() {
  const commerce = loadCommerceWorkspace()
  const website = loadWebsiteWorkspace(window.localStorage)
  return buildOperationalReport({
    mode: 'local',
    allowedProducts: ['commerce', 'website', 'ecommerce'],
    sources: [
      { surface: 'commerce', mode: commerce.error ? 'error' : 'sample', revision: null, updatedAt: null },
      { surface: 'website', mode: website.ok ? 'sample' : 'error', revision: null, updatedAt: null },
    ],
    commerce: commerce.error ? undefined : commerce.state,
    website: website.ok ? website.workspace : undefined,
    now: Date.now(),
  })
}

export function WorkspaceStatusPanel() {
  const report = useMemo(() => snapshotReport(), [])
  const attention = report.entries.filter((entry) => entry.severity !== 'ready').slice(0, MAX_SHOWN)
  if (!attention.length) return null
  return (
    <section aria-label="Items across products needing attention" className="wsp-panel">
      <ul className="wsp-list">
        {attention.map((entry) => (
          <li key={entry.id}>
            <Link className={`wsp-item wsp-${entry.severity}`} to={entry.route}>
              <b aria-hidden="true" className="wsp-mark" />
              <span className="wsp-copy">
                <span className="wsp-label">{entry.label}</span>
                <span className="wsp-meta">{entry.actionability.ownerReviewRequired ? 'Owner review · evidence and due time required · no external action' : 'Read-only status · no external action'}</span>
              </span>
              <span aria-hidden="true" className="wsp-arrow">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
