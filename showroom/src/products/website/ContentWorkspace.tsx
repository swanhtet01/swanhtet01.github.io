import {
  createBlankSection,
  formatTimestamp,
  MAX_WEBSITE_SECTIONS,
  pageIssues,
  type WebsitePage,
} from './website-model'

type ContentWorkspaceProps = {
  page: WebsitePage
  canDuplicate: boolean
  deleteArmed: boolean
  onDuplicate: () => void
  onRequestDelete: () => void
  onUpdatePage: (update: (page: WebsitePage) => WebsitePage) => void
}

export function ContentWorkspace({
  page,
  canDuplicate,
  deleteArmed,
  onDuplicate,
  onRequestDelete,
  onUpdatePage,
}: ContentWorkspaceProps) {
  const issues = pageIssues(page)

  function editPage(update: (current: WebsitePage) => WebsitePage) {
    onUpdatePage((current) => ({ ...update(current), stage: 'draft' }))
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    editPage((current) => {
      const currentIndex = current.sections.findIndex((section) => section.id === sectionId)
      const nextIndex = currentIndex + direction
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= current.sections.length) return current
      const sections = [...current.sections]
      const [section] = sections.splice(currentIndex, 1)
      sections.splice(nextIndex, 0, section)
      return { ...current, sections }
    })
  }

  return (
    <section className="website-editor-panel" aria-labelledby="content-editor-title">
      <header className="website-panel-head">
        <div>
          <span className="website-eyebrow">Page content</span>
          <h2 id="content-editor-title">{page.internalName || 'Untitled page'}</h2>
          <p>{page.stage === 'ready' ? 'Ready for the site-level checks.' : 'Draft changes stay out of the publish set.'}</p>
        </div>
        <span className={'website-status ' + (page.stage === 'ready' ? 'is-ready' : 'is-draft')}>
          {page.stage}
        </span>
      </header>

      <div className="website-editor-scroll">
        <fieldset className="website-fieldset">
          <legend>Page record</legend>
          <div className="website-form-grid two-columns">
            <label>
              <span>Internal name</span>
              <input
                maxLength={60}
                onChange={(event) => editPage((current) => ({ ...current, internalName: event.target.value }))}
                value={page.internalName}
              />
            </label>
            <label>
              <span>Path</span>
              <input
                autoCapitalize="none"
                maxLength={100}
                onChange={(event) => editPage((current) => ({ ...current, slug: event.target.value }))}
                spellCheck={false}
                value={page.slug}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="website-fieldset">
          <legend>Hero</legend>
          <div className="website-form-grid">
            <label>
              <span>Eyebrow</span>
              <input
                maxLength={80}
                onChange={(event) => editPage((current) => ({
                  ...current,
                  hero: { ...current.hero, eyebrow: event.target.value },
                }))}
                value={page.hero.eyebrow}
              />
            </label>
            <label>
              <span>Headline</span>
              <textarea
                maxLength={140}
                onChange={(event) => editPage((current) => ({
                  ...current,
                  hero: { ...current.hero, headline: event.target.value },
                }))}
                rows={2}
                value={page.hero.headline}
              />
            </label>
            <label>
              <span>Summary</span>
              <textarea
                maxLength={280}
                onChange={(event) => editPage((current) => ({
                  ...current,
                  hero: { ...current.hero, summary: event.target.value },
                }))}
                rows={3}
                value={page.hero.summary}
              />
            </label>
            <div className="website-form-grid two-columns">
              <label>
                <span>CTA label</span>
                <input
                  maxLength={40}
                  onChange={(event) => editPage((current) => ({
                    ...current,
                    hero: { ...current.hero, ctaLabel: event.target.value },
                  }))}
                  value={page.hero.ctaLabel}
                />
              </label>
              <label>
                <span>CTA destination</span>
                <input
                  autoCapitalize="none"
                  maxLength={160}
                  onChange={(event) => editPage((current) => ({
                    ...current,
                    hero: { ...current.hero, ctaHref: event.target.value },
                  }))}
                  spellCheck={false}
                  value={page.hero.ctaHref}
                />
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset className="website-fieldset has-heading-action">
          <legend>Content sections</legend>
          <button
            className="website-text-button website-fieldset-action"
            disabled={page.sections.length >= MAX_WEBSITE_SECTIONS}
            onClick={() => editPage((current) => ({
              ...current,
              sections: [...current.sections, createBlankSection()],
            }))}
            title={page.sections.length >= MAX_WEBSITE_SECTIONS ? 'The four-section page limit is reached' : 'Add a section'}
            type="button"
          >
            + Add section
          </button>
          <div className="website-section-list">
            {page.sections.length ? page.sections.map((section, index) => (
              <article className="website-section-editor" key={section.id}>
                <header>
                  <strong>Section {index + 1}</strong>
                  <div className="website-inline-actions">
                    <button
                      aria-label={'Move section ' + String(index + 1) + ' up'}
                      disabled={index === 0}
                      onClick={() => moveSection(section.id, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={'Move section ' + String(index + 1) + ' down'}
                      disabled={index === page.sections.length - 1}
                      onClick={() => moveSection(section.id, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      aria-label={'Remove section ' + String(index + 1)}
                      className="is-danger"
                      onClick={() => editPage((current) => ({
                        ...current,
                        sections: current.sections.filter((candidate) => candidate.id !== section.id),
                      }))}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </header>
                <div className="website-form-grid">
                  <label>
                    <span>Eyebrow</span>
                    <input
                      maxLength={60}
                      onChange={(event) => editPage((current) => ({
                        ...current,
                        sections: current.sections.map((candidate) => candidate.id === section.id
                          ? { ...candidate, eyebrow: event.target.value }
                          : candidate),
                      }))}
                      value={section.eyebrow}
                    />
                  </label>
                  <label>
                    <span>Title</span>
                    <input
                      maxLength={120}
                      onChange={(event) => editPage((current) => ({
                        ...current,
                        sections: current.sections.map((candidate) => candidate.id === section.id
                          ? { ...candidate, title: event.target.value }
                          : candidate),
                      }))}
                      value={section.title}
                    />
                  </label>
                  <label>
                    <span>Body</span>
                    <textarea
                      maxLength={360}
                      onChange={(event) => editPage((current) => ({
                        ...current,
                        sections: current.sections.map((candidate) => candidate.id === section.id
                          ? { ...candidate, body: event.target.value }
                          : candidate),
                      }))}
                      rows={3}
                      value={section.body}
                    />
                  </label>
                </div>
              </article>
            )) : (
              <div className="website-empty">
                <span aria-hidden="true">&gt;_</span>
                <p>Add one section before marking this page ready.</p>
              </div>
            )}
          </div>
        </fieldset>

        <details className="website-disclosure">
          <summary>
            <span>Search metadata</span>
            <small>{page.seo.title && page.seo.description ? 'Complete' : 'Needs copy'}</small>
          </summary>
          <div className="website-form-grid">
            <label>
              <span>SEO title</span>
              <input
                maxLength={70}
                onChange={(event) => editPage((current) => ({
                  ...current,
                  seo: { ...current.seo, title: event.target.value },
                }))}
                value={page.seo.title}
              />
            </label>
            <label>
              <span>SEO description</span>
              <textarea
                maxLength={160}
                onChange={(event) => editPage((current) => ({
                  ...current,
                  seo: { ...current.seo, description: event.target.value },
                }))}
                rows={3}
                value={page.seo.description}
              />
            </label>
          </div>
        </details>

        <section className={'website-page-check ' + (issues.length ? 'has-issues' : 'is-complete')} aria-label="Page readiness">
          <div>
            <strong>{issues.length ? String(issues.length) + ' page checks remain' : 'Page checks complete'}</strong>
            <small>Last changed {formatTimestamp(page.updatedAt)}</small>
          </div>
          {issues.length ? (
            <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          ) : (
            <p>Content, paths, sections, CTA, and metadata are complete for this page.</p>
          )}
        </section>
      </div>

      <footer className="website-panel-actions">
        <div>
          <button className="website-button is-secondary" disabled={!canDuplicate} onClick={onDuplicate} title={canDuplicate ? 'Duplicate this page' : 'The four-page prototype limit is reached'} type="button">
            Duplicate
          </button>
          {page.slug !== '/' && page.stage === 'draft' ? (
            <button
              className={'website-button is-quiet ' + (deleteArmed ? 'is-danger' : '')}
              onClick={onRequestDelete}
              type="button"
            >
              {deleteArmed ? 'Confirm remove' : 'Remove draft'}
            </button>
          ) : null}
        </div>
        {page.stage === 'ready' ? (
          <button
            className="website-button is-secondary"
            onClick={() => onUpdatePage((current) => ({ ...current, stage: 'draft' }))}
            type="button"
          >
            Return to draft
          </button>
        ) : (
          <button
            className="website-button is-primary"
            disabled={issues.length > 0}
            onClick={() => onUpdatePage((current) => ({ ...current, stage: 'ready' }))}
            type="button"
          >
            Mark page ready
          </button>
        )}
      </footer>
    </section>
  )
}
