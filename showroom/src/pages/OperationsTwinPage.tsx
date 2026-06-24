import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  latestReadingForAsset,
  operationsTwinActions,
  operationsTwinAnomalies,
  operationsTwinAssets,
  operationsTwinReadiness,
  operationsTwinSourcePackets,
  operationsTwinSummary,
  twinDelta,
  type TwinReading,
} from '../lib/operationsDigitalTwinModel'

const factoryModules = ['Assets', 'Anomalies', 'CAPA', 'Maintenance', 'Receiving'] as const

function formatTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not synced'
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDelta(reading: TwinReading) {
  const delta = twinDelta(reading)
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(delta % 1 === 0 ? 0 : 1)} ${reading.unit}`
}

function stateClass(state: string) {
  if (state === 'alert') return 'is-alert'
  if (state === 'watch') return 'is-watch'
  return 'is-ok'
}

export function OperationsTwinPage() {
  const summary = useMemo(() => operationsTwinSummary(), [])
  const [selectedAssetId, setSelectedAssetId] = useState(operationsTwinAssets[0]?.id ?? '')
  const [operatorNote, setOperatorNote] = useState('AI watch: source proof required')
  const selectedAsset = operationsTwinAssets.find((asset) => asset.id === selectedAssetId) ?? operationsTwinAssets[0]
  const selectedReading = selectedAsset ? latestReadingForAsset(selectedAsset.id) : null
  const selectedAnomalies = operationsTwinAnomalies.filter((item) => item.assetId === selectedAsset?.id)
  const activeAnomaly = (selectedAnomalies.length ? selectedAnomalies : operationsTwinAnomalies.slice(0, 1))[0]
  const primaryAction = operationsTwinActions[0]
  const primarySource = operationsTwinSourcePackets[0]

  return (
    <div className="sm-product-app-screen">
      <section className="sm-product-app-topline" aria-label="Factory Operations App status">
        <div>
          <p>Factory Operations App</p>
          <strong>{selectedAsset?.name ?? 'Asset map'}</strong>
        </div>
        <span>{operatorNote}</span>
      </section>

      <section className="sm-product-app-grid" aria-label="Factory Operations App workbench">
        <article className="sm-product-app-panel">
          <div className="sm-product-app-panel-head">
            <span>Assets</span>
            <strong>{summary.totalAssets} mapped</strong>
          </div>
          <div className="sm-product-app-list">
            {operationsTwinAssets.map((asset) => (
              <button
                className={`sm-product-app-row ${selectedAssetId === asset.id ? 'is-active' : ''}`}
                key={asset.id}
                onClick={() => {
                  setSelectedAssetId(asset.id)
                  setOperatorNote(`${asset.owner} owns review`)
                }}
                type="button"
              >
                <strong>{asset.name}</strong>
                <span>{asset.area} / {asset.type}</span>
                <small>{asset.expectedRange}</small>
                <em className={stateClass(asset.state)}>{asset.state}</em>
              </button>
            ))}
          </div>
        </article>

        <article className="sm-product-app-panel sm-product-app-panel-main">
          <div className="sm-product-app-panel-head">
            <span>Current state</span>
            <strong>{selectedAsset?.owner ?? 'Manager'}</strong>
          </div>
          <div className="sm-product-action-card">
            <span>{selectedReading?.label ?? 'Reading'}</span>
            <strong>
              {selectedReading ? `${selectedReading.value} ${selectedReading.unit}` : 'No reading'}
            </strong>
            <p>
              {selectedReading
                ? `${formatDelta(selectedReading)} / ${formatTime(selectedReading.capturedAt)} / ${selectedReading.source}`
                : selectedAsset?.source}
            </p>
            <div className="sm-product-app-actions">
              <button className="sm-button-primary" onClick={() => setOperatorNote('CAPA opened for manager review')} type="button">
                Open CAPA
              </button>
              <button className="sm-button-secondary" onClick={() => setOperatorNote('Maintenance check scheduled')} type="button">
                Schedule check
              </button>
              <Link className="sm-button-secondary" to="/contact?package=operations-digital-twin">
                Scope pilot
              </Link>
            </div>
          </div>

          <div className="sm-product-app-split">
            <div>
              <span>Anomaly</span>
              <p>{activeAnomaly?.title ?? 'No anomaly selected'}</p>
              <p>{activeAnomaly?.detail ?? 'Choose an asset to review.'}</p>
              <p>{activeAnomaly?.evidence ?? 'Evidence will stay linked here.'}</p>
            </div>
            <div>
              <span>Manager action</span>
              <p>{primaryAction?.title}</p>
              <p>{primaryAction?.owner} / {primaryAction?.due}</p>
              <p>{primaryAction?.status}</p>
            </div>
          </div>
        </article>

        <article className="sm-product-app-panel">
          <div className="sm-product-app-panel-head">
            <span>Modules</span>
            <strong>Plant scope</strong>
          </div>
          <div className="sm-product-app-list">
            {factoryModules.map((module) => (
              <div className="sm-product-app-row" key={module}>
                <strong>{module}</strong>
                <small>Source, owner, action, closeout.</small>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-product-app-panel sm-product-proof-strip" aria-label="Factory Operations App metrics">
          {[
            ['Readings', summary.liveReadings],
            ['Anomalies', summary.anomalyCount],
            ['Actions', summary.actionCount],
            ['Source', primarySource?.status ?? 'review'],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </article>

        <article className="sm-product-app-panel sm-product-wide-panel">
          <div className="sm-product-app-panel-head">
            <span>Release readiness</span>
            <strong>{primarySource?.label ?? 'Source packet'}</strong>
          </div>
          <div className="sm-products-check-list">
            {operationsTwinReadiness.slice(0, 5).map((step) => (
              <strong key={step.label}>{step.label}</strong>
            ))}
          </div>
        </article>
      </section>
    </div>
  )
}
