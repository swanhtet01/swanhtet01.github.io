import { useEffect, useRef, useState } from 'react'

import {
  createBlankSection,
  formatTimestamp,
  MAX_WEBSITE_SECTIONS,
  pageReadinessIssues,
  type WebsitePageEditorSection,
  type WebsitePageReadinessField,
  type WebsitePageReadinessIssue,
  type WebsitePage,
} from './website-model'
import {
  recoverWebsiteContentSection,
  removeWebsiteContentSection,
  type WebsiteRemovedContentSection,
} from './website-section-recovery'

type ReadinessRecovery = Readonly<{
  pageId: string
  issue: WebsitePageReadinessIssue
}>

const READINESS_RECOVERY_ID = 'website-page-readiness-recovery'

function readinessTargetKey(field: WebsitePageReadinessField, sectionId?: string) {
  return sectionId ? `${field}:${sectionId}` : field
}

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
  const readinessIssues = pageReadinessIssues(page)
  const issues = readinessIssues.map((issue) => issue.message)
  const [editorSection, setEditorSection] = useState<WebsitePageEditorSection>('hero')
  const [readinessRecovery, setReadinessRecovery] = useState<ReadinessRecovery | null>(null)
  const [removedSection, setRemovedSection] = useState<WebsiteRemovedContentSection | null>(null)
  const readinessTargetsRef = useRef(new Map<string, HTMLElement>())
  const sectionRecoveryRef = useRef<HTMLButtonElement>(null)
  const activeReadinessIssue = readinessRecovery?.pageId === page.id ? readinessRecovery.issue : null
  const removedSectionRecovery = removedSection?.pageId === page.id
    ? recoverWebsiteContentSection(page, removedSection)
    : null
  const activeRemovedSection = removedSectionRecovery?.ok ? removedSection : null
  const sectionRecoveryKey = activeRemovedSection
    ? `${activeRemovedSection.pageId}:${activeRemovedSection.section.id}`
    : ''

  useEffect(() => {
    if (!activeReadinessIssue) return
    const targetKey = readinessTargetKey(activeReadinessIssue.field, activeReadinessIssue.sectionId)
    const focusTarget = () => {
      const target = readinessTargetsRef.current.get(targetKey)
      if (!target?.isConnected) return
      target.scrollIntoView({ block: 'center', inline: 'nearest' })
      target.focus({ preventScroll: true })
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.select()
    }
    let nestedFrame = 0
    const frame = window.requestAnimationFrame(() => {
      nestedFrame = window.requestAnimationFrame(focusTarget)
    })
    const fallback = window.setTimeout(focusTarget, 220)
    return () => {
      window.cancelAnimationFrame(frame)
      if (nestedFrame) window.cancelAnimationFrame(nestedFrame)
      window.clearTimeout(fallback)
    }
  }, [activeReadinessIssue])

  useEffect(() => {
    if (!sectionRecoveryKey) return
    const focusUndo = () => {
      sectionRecoveryRef.current?.focus({ preventScroll: true })
    }
    const frame = window.requestAnimationFrame(focusUndo)
    const fallback = window.setTimeout(focusUndo, 180)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(fallback)
    }
  }, [sectionRecoveryKey])

  function readinessTargetProps(field: WebsitePageReadinessField, sectionId?: string) {
    const key = readinessTargetKey(field, sectionId)
    const active = activeReadinessIssue?.field === field && activeReadinessIssue.sectionId === sectionId
    return {
      'aria-describedby': active ? READINESS_RECOVERY_ID : undefined,
      'aria-invalid': active || undefined,
      ref: (node: HTMLElement | null) => {
        if (node) readinessTargetsRef.current.set(key, node)
        else readinessTargetsRef.current.delete(key)
      },
    }
  }

  function editPage(update: (current: WebsitePage) => WebsitePage) {
    setReadinessRecovery(null)
    setRemovedSection(null)
    onUpdatePage((current) => ({ ...update(current), stage: 'draft' }))
  }

  function reviewPageReadiness() {
    setRemovedSection(null)
    const issue = readinessIssues[0]
    if (issue) {
      setEditorSection(issue.editorSection)
      setReadinessRecovery({ pageId: page.id, issue })
      return
    }
    setReadinessRecovery(null)
    onUpdatePage((current) => ({ ...current, stage: 'ready' }))
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

  function removeSection(sectionId: string) {
    const removal = removeWebsiteContentSection(page, sectionId)
    if (!removal.ok) return
    setReadinessRecovery(null)
    setRemovedSection(removal.removed)
    onUpdatePage((current) => {
      const currentRemoval = removeWebsiteContentSection(current, sectionId)
      return currentRemoval.ok
        ? { ...current, sections: currentRemoval.sections, stage: 'draft' }
        : current
    })
  }

  function undoSectionRemoval() {
    if (!activeRemovedSection) return
    const recovery = recoverWebsiteContentSection(page, activeRemovedSection)
    setRemovedSection(null)
    if (!recovery.ok) return
    setReadinessRecovery(null)
    onUpdatePage((current) => {
      const currentRecovery = recoverWebsiteContentSection(current, activeRemovedSection)
      return currentRecovery.ok
        ? { ...current, sections: currentRecovery.sections, stage: 'draft' }
        : current
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

      <div className="website-editor-scroll" data-editor-section={editorSection}>
        <label className="website-editor-section-picker">
          <span>Edit</span>
          <select aria-label="Page section to edit" onChange={(event) => { setEditorSection(event.target.value as WebsitePageEditorSection); setReadinessRecovery(null); setRemovedSection(null) }} value={editorSection}>
            <option value="hero">Hero</option>
            <option value="sections">Content sections</option>
            <option value="page">Page details</option>
            <option value="seo">Search metadata</option>
          </select>
        </label>

        <fieldset className="website-fieldset" data-content-section="page">
          <legend>Page record</legend>
          <div className="website-form-grid two-columns">
            <label>
              <span>Internal name</span>
              <input
                maxLength={60}
                onChange={(event) => editPage((current) => ({ ...current, internalName: event.target.value }))}
                {...readinessTargetProps('internal-name')}
                value={page.internalName}
              />
            </label>
            <label>
              <span>Path</span>
              <input
                autoCapitalize="none"
                maxLength={100}
                onChange={(event) => editPage((current) => ({ ...current, slug: event.target.value }))}
                {...readinessTargetProps('path')}
                spellCheck={false}
                value={page.slug}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="website-fieldset" data-content-section="hero">
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
                {...readinessTargetProps('hero-headline')}
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
                {...readinessTargetProps('hero-summary')}
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
                  {...readinessTargetProps('hero-cta-label')}
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
                  {...readinessTargetProps('hero-cta-destination')}
                  spellCheck={false}
                  value={page.hero.ctaHref}
                />
              </label>
            </div>
          </div>
        </fieldset>

        <fieldset className="website-fieldset has-heading-action" data-content-section="sections">
          <legend>Content sections</legend>
          <button
            className="website-text-button website-fieldset-action"
            disabled={page.sections.length >= MAX_WEBSITE_SECTIONS}
            onClick={() => editPage((current) => ({
              ...current,
              sections: [...current.sections, createBlankSection()],
            }))}
            {...readinessTargetProps('section-add')}
            title={page.sections.length >= MAX_WEBSITE_SECTIONS ? 'The four-section page limit is reached' : 'Add a section'}
            type="button"
          >
            + Add section
          </button>
          {activeRemovedSection ? (
            <div
              className="website-section-remove-recovery"
              data-website-section-remove-recovery={activeRemovedSection.section.id}
              role="status"
            >
              <div>
                <strong>{activeRemovedSection.section.title.trim() || `Section ${activeRemovedSection.index + 1}`} removed</strong>
                <small>Undo restores it as section {activeRemovedSection.index + 1}. This only changes the unsaved preview; nothing was saved, published, sent, or added to inquiries.</small>
              </div>
              <button
                aria-label={`Undo remove ${activeRemovedSection.section.title.trim() || `section ${activeRemovedSection.index + 1}`}`}
                className="website-button is-secondary"
                onClick={undoSectionRemoval}
                ref={sectionRecoveryRef}
                type="button"
              >
                Undo remove
              </button>
            </div>
          ) : null}
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
                      onClick={() => removeSection(section.id)}
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
                      {...readinessTargetProps('section-title', section.id)}
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
                      {...readinessTargetProps('section-body', section.id)}
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

        <details className="website-disclosure" data-content-section="seo" open>
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
                {...readinessTargetProps('seo-title')}
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
                {...readinessTargetProps('seo-description')}
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
          {activeReadinessIssue ? (
            <p aria-live="assertive" className="website-page-recovery" id={READINESS_RECOVERY_ID}>
              {activeReadinessIssue.message} Your unsaved preview is still here; nothing was saved or published.
            </p>
          ) : null}
        </section>
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
        ) : (
          <button
            className="website-button is-primary"
            onClick={reviewPageReadiness}
            title={issues.length ? `Fix first check: ${issues[0]}` : 'Mark this page ready in the unsaved preview'}
            type="button"
          >
            Mark page ready
          </button>
        )}
      </footer>
    </section>
  )
}
