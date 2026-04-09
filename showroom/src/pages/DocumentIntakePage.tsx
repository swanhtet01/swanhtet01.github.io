import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { checkWorkspaceHealth, workspaceFetch } from '../lib/workspaceApi'

type AnalysisPayload = {
  filename: string
  document_type: string
  recommended_module: string
  summary: string
  preview: string
  extracted_fields: Record<string, string>
  meta?: Record<string, unknown>
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export function DocumentIntakePage() {
  const [busy, setBusy] = useState(false)
  const [apiReady, setApiReady] = useState<boolean | null>(null)
  const [fileName, setFileName] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(file: File | null) {
    if (!file) {
      return
    }

    setBusy(true)
    setError(null)
    setAnalysis(null)
    setFileName(file.name)

    try {
      const health = await checkWorkspaceHealth()
      setApiReady(health.ready)
      if (!health.ready) {
        setError('Workspace API is not connected on this host yet.')
        return
      }

      const contentBase64 = await fileToBase64(file)
      const payload = await workspaceFetch<{ analysis: AnalysisPayload }>('/api/tools/document-intake', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          content_base64: contentBase64,
        }),
      })
      setAnalysis(payload.analysis)
    } catch {
      setError('Document intake could not process that file yet.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Semi-product"
        title="Document Intake"
        description="Upload a real file and turn it into a routed, structured intake result instead of another manual review step."
      />

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Upload a file</p>
          <h2 className="mt-3 text-3xl font-bold text-white">Use actual documents, not just pasted text.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This intake layer reads supported PDFs, spreadsheets, text files, CSV, and JSON, then suggests the right SUPERMEGA.dev module to route it into.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="sm-chip text-white">PDF via `pypdf`</div>
            <div className="sm-chip text-white">Excel via `openpyxl`</div>
            <div className="sm-chip text-white">Text, CSV, and JSON</div>
          </div>

          <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-white/12 bg-[rgba(255,255,255,0.03)] px-6 py-10 text-center">
            <span className="text-lg font-semibold text-white">{busy ? 'Processing file...' : 'Choose a document'}</span>
            <span className="mt-2 text-sm text-[var(--sm-muted)]">Invoices, GRNs, stock sheets, complaint PDFs, and similar files.</span>
            <input
              accept=".pdf,.xlsx,.xlsm,.txt,.csv,.json,.md"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null
                void handleFileChange(nextFile)
              }}
              type="file"
            />
          </label>

          {fileName ? <div className="mt-4 sm-chip text-white">Current file: {fileName}</div> : null}
          {error ? <div className="mt-4 sm-chip text-white">{error}</div> : null}
          {apiReady === false ? (
            <div className="mt-4 sm-chip text-white">Run the workspace service to use file intake on this host.</div>
          ) : null}
        </article>

        <article className="sm-terminal p-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">Intake result</p>
              <h2 className="mt-2 text-2xl font-bold text-white">Route the file into the right system.</h2>
            </div>
            <span className="sm-status-pill">
              <span className={`sm-led ${analysis ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {analysis ? 'Ready' : 'Waiting'}
            </span>
          </div>

          {analysis ? (
            <div className="mt-5 grid gap-4">
              <div className="sm-proof-card">
                <p className="sm-kicker text-[var(--sm-accent)]">Recommended module</p>
                <p className="mt-3 text-2xl font-bold text-white">{analysis.recommended_module}</p>
                <p className="mt-3 text-sm text-[var(--sm-muted)]">{analysis.summary}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent)]">Detected type</p>
                  <p className="mt-2">{analysis.document_type}</p>
                </div>
                <div className="sm-chip text-white">
                  <p className="sm-kicker text-[var(--sm-accent-alt)]">Source file</p>
                  <p className="mt-2 break-all">{analysis.filename}</p>
                </div>
              </div>

              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Extracted fields</p>
                {Object.keys(analysis.extracted_fields).length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--sm-muted)]">No strong fields extracted from this file yet.</p>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {Object.entries(analysis.extracted_fields).map(([key, value]) => (
                      <div className="flex items-center justify-between gap-3 text-sm" key={key}>
                        <span className="uppercase tracking-[0.18em] text-[var(--sm-accent)]">{key}</span>
                        <span className="text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Preview</p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--sm-muted)]">{analysis.preview || 'No preview extracted.'}</p>
              </div>
            </div>
          ) : (
            <div className="mt-5 sm-chip text-[var(--sm-muted)]">Upload a file to see where it belongs and what fields can be extracted from it.</div>
          )}
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Best fit</p>
          <div className="mt-5 grid gap-3">
            <div className="sm-chip text-white">Goods received notes and packing lists</div>
            <div className="sm-chip text-white">Stock and warehouse spreadsheets</div>
            <div className="sm-chip text-white">Invoices, complaints, and quality evidence</div>
          </div>
        </article>

        <article className="sm-surface p-6">
          <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
          <h2 className="mt-3 text-2xl font-bold text-white">Use intake as the front door.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">
            This should feed directly into Action OS, Receiving Control, Cash Watch, and Quality Closeout so teams do not need to retype key facts after opening a file.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/actions">
              Open Action OS
            </Link>
            <Link className="sm-button-secondary" to="/products">
              See all products
            </Link>
          </div>
        </article>
      </section>
    </div>
  )
}
