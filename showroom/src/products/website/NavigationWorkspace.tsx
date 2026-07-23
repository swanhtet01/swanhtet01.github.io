import { type WebsitePage, type WebsiteWorkspace } from './website-model'

type NavigationWorkspaceProps = {
  workspace: WebsiteWorkspace
  onMovePage: (pageId: string, direction: -1 | 1) => void
  onSelectPage: (pageId: string) => void
  onSiteNameChange: (siteName: string) => void
  onUpdatePage: (pageId: string, update: (page: WebsitePage) => WebsitePage) => void
}

export function NavigationWorkspace({
  workspace,
  onMovePage,
  onSelectPage,
  onSiteNameChange,
  onUpdatePage,
}: NavigationWorkspaceProps) {
  const visibleCount = workspace.pages.filter((page) => page.navigation.visible).length

  return (
    <section className="website-editor-panel" aria-labelledby="navigation-editor-title">
      <header className="website-panel-head">
        <div>
          <span className="website-eyebrow">Navigation</span>
          <h2 id="navigation-editor-title">Site structure</h2>
          <p>Order the finite page set and choose what visitors can see.</p>
        </div>
        <span className="website-record-count">{visibleCount} visible</span>
      </header>

      <div className="website-editor-scroll">
        <fieldset className="website-fieldset">
          <legend>Site identity</legend>
          <label>
            <span>Site name</span>
            <input
              maxLength={60}
              onChange={(event) => onSiteNameChange(event.target.value)}
              value={workspace.siteName}
            />
          </label>
          <p className="website-field-help">Used in the preview header and the approved snapshot.</p>
        </fieldset>

        <section className="website-navigation-editor" aria-labelledby="primary-navigation-title">
          <header>
            <div>
              <span className="website-eyebrow">Primary navigation</span>
              <h3 id="primary-navigation-title">{workspace.pages.length} pages</h3>
            </div>
            <small>Top to bottom</small>
          </header>

          <div className="website-navigation-list">
            {workspace.pages.map((page, index) => (
              <article className="website-navigation-row" key={page.id}>
                <label className="website-switch">
                  <input
                    checked={page.navigation.visible}
                    onChange={(event) => onUpdatePage(page.id, (current) => ({
                      ...current,
                      navigation: { ...current.navigation, visible: event.target.checked },
                    }))}
                    type="checkbox"
                  />
                  <span>Visible</span>
                </label>
                <div className="website-navigation-copy">
                  <label>
                    <span>Label</span>
                    <input
                      maxLength={40}
                      onChange={(event) => onUpdatePage(page.id, (current) => ({
                        ...current,
                        navigation: { ...current.navigation, label: event.target.value },
                      }))}
                      value={page.navigation.label}
                    />
                  </label>
                  <div>
                    <code>{page.slug}</code>
                    <span className={'website-status ' + (page.stage === 'ready' ? 'is-ready' : 'is-draft')}>
                      {page.stage}
                    </span>
                  </div>
                </div>
                <div className="website-navigation-actions">
                  <button
                    aria-label={'Move ' + page.internalName + ' up'}
                    disabled={index === 0}
                    onClick={() => onMovePage(page.id, -1)}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={'Move ' + page.internalName + ' down'}
                    disabled={index === workspace.pages.length - 1}
                    onClick={() => onMovePage(page.id, 1)}
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    aria-label={'Preview ' + page.internalName}
                    onClick={() => onSelectPage(page.id)}
                    type="button"
                  >
                    Preview
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="website-boundary-note">
          <span aria-hidden="true">&gt;_</span>
          <div>
            <strong>Navigation changes remain draft data.</strong>
            <p>A visible draft page will fail the publish-readiness gate. No route or deployment configuration is changed here.</p>
          </div>
        </aside>
      </div>
    </section>
  )
}
