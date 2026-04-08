import type { DemoScenario, DemoCardItem } from '../lib/siteSystems'

type Props = {
  scenario: DemoScenario
  compact?: boolean
}

function toneClass(tone: DemoCardItem['tone']) {
  if (tone === 'accent') return 'sm-demo-item-accent'
  if (tone === 'warn') return 'sm-demo-item-warn'
  return ''
}

export function SystemDemoCanvas({ scenario, compact = false }: Props) {
  return (
    <div className={`sm-demo-frame ${compact ? 'sm-demo-frame-compact' : ''}`}>
      <div className="sm-demo-windowbar">
        <div className="sm-demo-windowdots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="sm-demo-windowpill">{compact ? scenario.label : 'Live example'}</div>
      </div>
      <div className="sm-demo-topbar">
        <div>
          <p className="sm-demo-context">{scenario.label}</p>
          {!compact ? <p className="sm-demo-subcontext">{scenario.context}</p> : null}
        </div>
        <div className="sm-demo-metrics">
          {scenario.metrics.map((metric) => (
            <div className="sm-demo-metric" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      </div>

      {scenario.kind === 'sales' ? (
        <div className="sm-demo-sales-grid">
          {scenario.columns.map((column) => (
            <section className="sm-demo-lane" key={column.name}>
              <header className="sm-demo-lane-title">{column.name}</header>
              <div className="sm-demo-stack">
                {column.items.map((item) => (
                  <article className={`sm-demo-item ${toneClass(item.tone)}`} key={`${column.name}-${item.title}`}>
                    <strong>{item.title}</strong>
                    <span>{item.subtitle}</span>
                    {item.meta ? <small>{item.meta}</small> : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {scenario.kind === 'operations' ? (
        <div className="sm-demo-ops-grid">
          <section className="sm-demo-list-panel">
            <header className="sm-demo-lane-title">Inbox</header>
            <div className="sm-demo-stack">
              {scenario.inbox.map((item) => (
                <article className={`sm-demo-item ${toneClass(item.tone)}`} key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                  {item.meta ? <small>{item.meta}</small> : null}
                </article>
              ))}
            </div>
          </section>
          <section className="sm-demo-list-panel">
            <header className="sm-demo-lane-title">Approvals</header>
            <div className="sm-demo-stack">
              {scenario.approvals.map((item) => (
                <article className={`sm-demo-item ${toneClass(item.tone)}`} key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                  {item.meta ? <small>{item.meta}</small> : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {scenario.kind === 'brief' ? (
        <div className="sm-demo-brief-grid">
          <section className="sm-demo-list-panel">
            <header className="sm-demo-lane-title">Priority today</header>
            <div className="sm-demo-stack">
              {scenario.priorities.map((item) => (
                <article className={`sm-demo-item ${toneClass(item.tone)}`} key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                  {item.meta ? <small>{item.meta}</small> : null}
                </article>
              ))}
            </div>
          </section>
          <section className="sm-demo-list-panel">
            <header className="sm-demo-lane-title">Watch</header>
            <div className="sm-demo-stack">
              {scenario.watch.map((item) => (
                <article className={`sm-demo-item ${toneClass(item.tone)}`} key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                  {item.meta ? <small>{item.meta}</small> : null}
                </article>
              ))}
            </div>
          </section>
          <section className="sm-demo-list-panel">
            <header className="sm-demo-lane-title">Wins</header>
            <div className="sm-demo-stack">
              {scenario.wins.map((item) => (
                <article className={`sm-demo-item ${toneClass(item.tone)}`} key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                  {item.meta ? <small>{item.meta}</small> : null}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {scenario.kind === 'portal' ? (
        <div className="sm-demo-portal-grid">
          {scenario.sections.map((section) => (
            <section className="sm-demo-list-panel" key={section.name}>
              <header className="sm-demo-lane-title">{section.name}</header>
              <div className="sm-demo-stack">
                {section.items.map((item) => (
                  <article className={`sm-demo-item ${toneClass(item.tone)}`} key={`${section.name}-${item.title}`}>
                    <strong>{item.title}</strong>
                    <span>{item.subtitle}</span>
                    {item.meta ? <small>{item.meta}</small> : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  )
}
