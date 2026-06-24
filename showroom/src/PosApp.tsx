import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { RouteEffects } from './components/RouteEffects'
import { PosLoginPage } from './pages/PosLoginPage'
import { PosRoleSelectionPage } from './pages/PosRoleSelectionPage'
import { PosWorkspacePage } from './pages/PosWorkspacePage'

export default function PosApp() {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }
    const root = document.getElementById('root')
    const html = document.documentElement
    const body = document.body
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootOverflow: root?.style.overflow || '',
      rootHeight: root?.style.height || '',
      posHostFlag: body.dataset.smPosHost,
    }

    html.style.overflow = 'hidden'
    html.style.height = '100%'
    body.style.overflow = 'hidden'
    body.style.height = '100%'
    if (root) {
      root.style.overflow = 'hidden'
      root.style.height = '100svh'
    }
    body.dataset.smPosHost = '1'

    return () => {
      html.style.overflow = previous.htmlOverflow
      html.style.height = previous.htmlHeight
      body.style.overflow = previous.bodyOverflow
      body.style.height = previous.bodyHeight
      if (root) {
        root.style.overflow = previous.rootOverflow
        root.style.height = previous.rootHeight
      }
      if (previous.posHostFlag) {
        body.dataset.smPosHost = previous.posHostFlag
      } else {
        delete body.dataset.smPosHost
      }
    }
  }, [])

  return (
    <div className="sm-pos-host-shell">
      <BrowserRouter>
        <RouteEffects />
        <Routes>
          <Route element={<Navigate replace to="/pos/login" />} path="/" />
          <Route element={<Navigate replace to="/pos/login" />} path="/pos" />
          <Route element={<PosLoginPage />} path="/pos/login" />
          <Route element={<PosRoleSelectionPage />} path="/pos/role" />
          <Route element={<PosWorkspacePage />} path="/pos/workspace" />
          <Route element={<Navigate replace to="/pos/login" />} path="/login" />
          <Route element={<Navigate replace to="/pos/login" />} path="/app/*" />
          <Route element={<Navigate replace to="/pos/login" />} path="*" />
        </Routes>
      </BrowserRouter>
    </div>
  )
}
