import { useEffect, useRef, useState } from 'react'

import {
  createBlankSection,
  MAX_WEBSITE_SECTIONS,
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
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [removedSection, setRemovedSection] = useState<{ section: WebsitePage['sections'][number]; index: number } | null>(null)
  const fieldsRef = useRef<HTMLDivElement>(null)
  const addSectionRef = useRef<HTMLButtonElement>(null)
  const focusAddSection = useRef(false)

  useEffect(() => {
    if (focusAddSection.current) {
      addSectionRef.current?.focus()
      focusAddSection.current = false
    }
    if (!editingSection) return
    const field = fieldsRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-editor-start]')
    field?.focus()
  }, [editingSection, page.sections.length])

  function editPage(update: (current: WebsitePage) => WebsitePage) {
    onUpdatePage((current) => ({ ...update(current), stage: 'draft' }))
  }

  function toggleEditor(sectionId: string) {
    setEditingSection((current) => current === sectionId ? null : sectionId)
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

  function addSection() {
    if (page.sections.length >= MAX_WEBSITE_SECTIONS) return
    const section = createBlankSection()
    editPage((current) => ({ ...current, sections: [...current.sections, section] }))
    setEditingSection(`section:${section.id}`)
  }

  function removeSection(sectionId: string) {
    const index = page.sections.findIndex((section) => section.id === sectionId)
    if (index < 0) return
    setRemovedSection({ section: page.sections[index], index })
    editPage((current) => ({ ...current, sections: current.sections.filter((section) => section.id !== sectionId) }))
    focusAddSection.current = true
    setEditingSection(null)
  }

  function restoreSection() {
    if (!removedSection || page.sections.length >= MAX_WEBSITE_SECTIONS
      || page.sections.some((section) => section.id === removedSection.section.id)) return
    editPage((current) => {
      const sections = [...current.sections]
      sections.splice(Math.min(removedSection.index, sections.length), 0, removedSection.section)
      return { ...current, sections }
    })
    setEditingSection(`section:${removedSection.section.id}`)
    setRemovedSection(null)
  }

  return (
    <section className="website-editor-panel" aria-labelledby="content-editor-title">
      <header className="website-panel-head">
        <div>
          <span className="website-eyebrow">Page content</span>
          <h2 id="content-editor-title">{page.internalName || 'Untitled page'}</h2>
          <p>Edit a section when you need to change it.</p>
        </div>
        <span className={'website-status ' + (page.stage === 'ready' ? 'is-ready' : 'is-draft')}>
          {page.stage}
        </span>
      </header>

      <div className="website-editor-scroll website-page-outline">
        <details className="website-disclosure" data-content-section="page">
          <summary>
            <span>Page details</span>
            <small>{page.slug || 'Set a page address'}</small>
          </summary>
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
        </details>

        <div aria-label="Page sections" className="website-page-card-list">
          <fieldset className="website-fieldset website-page-card" data-content-section="hero">
            <legend className="sr-only">Welcome section</legend>
            <div className="website-page-card-copy">
              <span className="website-eyebrow">Welcome</span>
              <h3>{page.hero.headline || 'Your main message'}</h3>
              <p>{page.hero.summary || 'Tell customers what your business offers.'}</p>
            </div>
            <button
              aria-controls="website-welcome-fields"
              aria-expanded={editingSection === 'welcome'}
              className="website-button is-secondary is-compact"
              onClick={() => toggleEditor('welcome')}
              type="button"
            >
              {editingSection === 'welcome' ? 'Done' : 'Edit'}
            </button>
            {editingSection === 'welcome' ? <div className="website-page-card-fields" id="website-welcome-fields" ref={fieldsRef}>
              <label>
                <span>Short label</span>
                <input
                  maxLength={80}
                  onChange={(event) => editPage((current) => ({ ...current, hero: { ...current.hero, eyebrow: event.target.value } }))}
                  value={page.hero.eyebrow}
                />
              </label>
              <label>
                <span>Headline</span>
                <textarea
                  data-editor-start
                  maxLength={140}
                  onChange={(event) => editPage((current) => ({ ...current, hero: { ...current.hero, headline: event.target.value } }))}
                  rows={2}
                  value={page.hero.headline}
                />
              </label>
              <label>
                <span>Summary</span>
                <textarea
                  maxLength={280}
                  onChange={(event) => editPage((current) => ({ ...current, hero: { ...current.hero, summary: event.target.value } }))}
                  rows={3}
                  value={page.hero.summary}
                />
              </label>
              <div className="website-form-grid two-columns">
                <label>
                  <span>Button text</span>
                  <input
                    maxLength={40}
                    onChange={(event) => editPage((current) => ({ ...current, hero: { ...current.hero, ctaLabel: event.target.value } }))}
                    value={page.hero.ctaLabel}
                  />
                </label>
                <label>
                  <span>Button link</span>
                  <input
                    autoCapitalize="none"
                    maxLength={160}
                    onChange={(event) => editPage((current) => ({ ...current, hero: { ...current.hero, ctaHref: event.target.value } }))}
                    spellCheck={false}
                    value={page.hero.ctaHref}
                  />
                </label>
              </div>
            </div> : null}
          </fieldset>

          <fieldset className="website-fieldset website-page-sections" data-content-section="sections">
            <legend className="sr-only">Page sections</legend>
            <header className="website-page-sections-head">
              <div><span className="website-eyebrow">On this page</span><strong>{page.sections.length} section{page.sections.length === 1 ? '' : 's'}</strong></div>
              <button
                className="website-button is-secondary is-compact"
                disabled={page.sections.length >= MAX_WEBSITE_SECTIONS}
                onClick={addSection}
                ref={addSectionRef}
                title={page.sections.length >= MAX_WEBSITE_SECTIONS ? 'The four-section page limit is reached' : 'Add a section'}
                type="button"
              >
                Add section
              </button>
            </header>
            {removedSection && !page.sections.some((section) => section.id === removedSection.section.id) ? <div className="website-section-undo" role="status">
              <span>Section removed.</span>
              <button
                disabled={page.sections.length >= MAX_WEBSITE_SECTIONS}
                onClick={restoreSection}
                type="button"
              >Undo</button>
              {page.sections.length >= MAX_WEBSITE_SECTIONS ? <small>This page already has four sections.</small> : null}
            </div> : null}
            <div className="website-page-card-list">
              {page.sections.length ? page.sections.map((section, index) => {
                const editorId = `section:${section.id}`
                const fieldsId = `website-section-fields-${section.id}`
                return <article className="website-page-card website-section-card" data-content-section="section" key={section.id}>
                  <div className="website-page-card-copy">
                    <span className="website-eyebrow">{section.eyebrow || `Section ${index + 1}`}</span>
                    <h3>{section.title || 'Untitled section'}</h3>
                    <p>{section.body || 'Add a short description for your customers.'}</p>
                  </div>
                  <button
                    aria-controls={fieldsId}
                    aria-expanded={editingSection === editorId}
                    className="website-button is-secondary is-compact"
                    onClick={() => toggleEditor(editorId)}
                    type="button"
                  >
                    {editingSection === editorId ? 'Done' : 'Edit'}
                  </button>
                  {editingSection === editorId ? <div className="website-page-card-fields" id={fieldsId} ref={fieldsRef}>
                    <div className="website-section-order-actions">
                      <button aria-label={`Move section ${index + 1} up`} disabled={index === 0} onClick={() => moveSection(section.id, -1)} type="button">Move up</button>
                      <button aria-label={`Move section ${index + 1} down`} disabled={index === page.sections.length - 1} onClick={() => moveSection(section.id, 1)} type="button">Move down</button>
                      <button
                        aria-label={`Remove section ${index + 1}`}
                        className="is-danger"
                        onClick={() => removeSection(section.id)}
                        type="button"
                      >
                        Remove section
                      </button>
                    </div>
                    <label>
                      <span>Short label</span>
                      <input
                        maxLength={60}
                        onChange={(event) => editPage((current) => ({
                          ...current,
                          sections: current.sections.map((candidate) => candidate.id === section.id ? { ...candidate, eyebrow: event.target.value } : candidate),
                        }))}
                        value={section.eyebrow}
                      />
                    </label>
                    <label>
                      <span>Title</span>
                      <input
                        data-editor-start
                        maxLength={120}
                        onChange={(event) => editPage((current) => ({
                          ...current,
                          sections: current.sections.map((candidate) => candidate.id === section.id ? { ...candidate, title: event.target.value } : candidate),
                        }))}
                        value={section.title}
                      />
                    </label>
                    <label>
                      <span>Text</span>
                      <textarea
                        maxLength={360}
                        onChange={(event) => editPage((current) => ({
                          ...current,
                          sections: current.sections.map((candidate) => candidate.id === section.id ? { ...candidate, body: event.target.value } : candidate),
                        }))}
                        rows={3}
                        value={section.body}
                      />
                    </label>
                  </div> : null}
                </article>
              }) : <div className="website-empty"><p>Add a section for your services, products, or location.</p></div>}
            </div>
          </fieldset>
        </div>

        <details className="website-disclosure" data-content-section="seo">
          <summary>
            <span>Search preview</span>
            <small>{page.seo.title && page.seo.description ? 'Complete' : 'Needs copy'}</small>
          </summary>
          <div className="website-form-grid">
            <label>
              <span>Search title</span>
              <input
                maxLength={70}
                onChange={(event) => editPage((current) => ({ ...current, seo: { ...current.seo, title: event.target.value } }))}
                value={page.seo.title}
              />
            </label>
            <label>
              <span>Search description</span>
              <textarea
                maxLength={160}
                onChange={(event) => editPage((current) => ({ ...current, seo: { ...current.seo, description: event.target.value } }))}
                rows={3}
                value={page.seo.description}
              />
            </label>
          </div>
        </details>
      </div>

      <footer className="website-panel-actions">
        <div>
          <button className="website-button is-secondary" disabled={!canDuplicate} onClick={onDuplicate} title={canDuplicate ? 'Duplicate this page' : 'The four-page workspace limit is reached'} type="button">
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
        ) : null}
      </footer>
    </section>
  )
}
