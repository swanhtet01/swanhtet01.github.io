import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const root = process.cwd()
const outputRoot = resolve(root, '.vercel', 'output')
const staticRoot = resolve(outputRoot, 'static')
const port = Number(process.env.PORT || process.argv[2] || 8807)
const host = process.env.HOST || '127.0.0.1'
const require = createRequire(import.meta.url)

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
])

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'content-type': type })
  response.end(body)
}

function redirect(location) {
  return { redirect: location }
}

const nodeFunctionHandlers = new Map()

function nodeFunctionHandler(name) {
  if (!nodeFunctionHandlers.has(name)) {
    const outputFunctionPath = resolve(outputRoot, 'functions', 'api', `${name}.func`, 'api', name)
    const sourceFunctionPath = resolve(root, 'api', name)
    nodeFunctionHandlers.set(name, require(existsSync(outputFunctionPath) ? outputFunctionPath : sourceFunctionPath))
  }
  return nodeFunctionHandlers.get(name)
}

function runNodeFunction(name, request, response) {
  let handler
  try {
    handler = nodeFunctionHandler(name)
  } catch (error) {
    return send(
      response,
      500,
      JSON.stringify({ status: 'error', endpoint: name, reason: 'local_function_load_failed', detail: String(error?.message || error) }),
      'application/json; charset=utf-8',
    )
  }

  Promise.resolve(handler(request, response)).catch((error) => {
    if (!response.writableEnded) {
      send(
        response,
        500,
        JSON.stringify({ status: 'error', endpoint: name, reason: 'local_function_failed', detail: String(error?.message || error) }),
        'application/json; charset=utf-8',
      )
    }
  })
  return undefined
}

function publicPathFor(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`)
  if (url.pathname === '/api/health') return { api: 'health' }
  if (url.pathname === '/api/contact-submissions') return { api: 'contact-submissions' }
  if (url.pathname === '/api/contact-submissions/status') return { api: 'contact-status' }
  if (url.pathname === '/api/checkout-start' || url.pathname === '/api/checkout-start/status') return { api: 'checkout-start' }
  if (url.pathname === '/api/pipeline-control' || url.pathname === '/api/pipeline-control/status') return { api: 'pipeline-control' }
  if (url.pathname === '/api/product-activation' || url.pathname === '/api/product-activation/status') return { api: 'product-activation' }

  let pathname = decodeURIComponent(url.pathname)
  if (/^\/app\/start\/?$/i.test(pathname)) pathname = '/app/start/'
  else if (/^\/(?:login|app|clients)(?:\/.*)?$/i.test(pathname)) return { api: 'public-app-handoff' }
  if (pathname.startsWith('/c/')) pathname = '/c/'
  if (
    /^\/(?:get-started|book|try|setup|intake|free|free-tool|scan|daily-close|payment-close|mmqr|agent-builder|agent-scope|ai-agent|agent-tool)\/?$/.test(
      pathname,
    )
  ) {
    pathname = '/contact/'
  }
  if (/^\/(?:start|pricing|plans|packages)\/?$/.test(pathname)) pathname = '/contact/'
  if (/^\/products\/(?:ai-workflow-desk|build-app-from-workflow|workflow-desk|workdesk)\/?$/.test(pathname)) {
    return redirect('/contact/?package=document-extraction-ledger')
  }
  if (
    /^\/products\/(?:factory-issues-maintenance-quality|factorydesk|industrial-plant-os|operations-digital-twin)\/?$/.test(
      pathname,
    )
  ) {
    return redirect('/contact/?package=factory-issues-maintenance-quality')
  }
  if (
    /^\/products\/(?:restaurant-pos-desk|restaurant-pos-menu-inventory|service-desk-pos|storedesk)\/?$/.test(pathname)
  ) {
    return redirect('/contact/?package=restaurant-pos-menu-inventory')
  }
  if (
    /^\/(?:about|demo|demos|demo-center|enterprise-demo|modules|portal-types|implementation|how-it-works|portfolio|tools|value|proof|platform|solutions|find-companies|company-list|task-list|receiving-log)\/?$/.test(
      pathname,
    )
  ) {
    return redirect('/#products')
  }
  if (/^\/products\/industrial-dqms\/?$/.test(pathname)) return redirect('/#products')
  if (pathname === '/') pathname = '/index.html'

  let filePath = join(staticRoot, pathname)
  if (!filePath.startsWith(staticRoot)) return null
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html')
  if (!existsSync(filePath) && !extname(filePath)) filePath = join(filePath, 'index.html')
  return { filePath }
}

const server = createServer((request, response) => {
  const target = publicPathFor(request.url || '/')
  if (!target) return send(response, 403, 'forbidden')
  if (target.api === 'health') return send(response, 200, JSON.stringify({ status: 'ready' }), 'application/json; charset=utf-8')
  if (target.api === 'contact-submissions') {
    if (request.method !== 'POST') return send(response, 401, 'login required')
    request.resume()
    request.on('end', () => {
      return send(
        response,
        200,
        JSON.stringify({
          status: 'ready',
          message: 'Request received.',
          next_step: 'We will review the request and reply to the submitted email.',
          reference: 'LEAD-LOCAL-RECEIPT',
        }),
        'application/json; charset=utf-8',
      )
    })
    return undefined
  }
  if (target.api === 'contact-status') {
    return send(
      response,
      200,
      JSON.stringify({
        status: 'ready',
        endpoint: 'contact-submissions',
        lead_scoring: 'ready',
        utm_tracking: 'ready',
        lead_ledger: 'local_stub',
        onboarding: {
          access_policy: 'approval_required',
          workspace_status: 'not_created_until_approved',
        },
      }),
      'application/json; charset=utf-8',
    )
  }
  if (target.api === 'checkout-start') return runNodeFunction('checkout-start.js', request, response)
  if (target.api === 'pipeline-control') return runNodeFunction('pipeline-control.js', request, response)
  if (target.api === 'product-activation') return runNodeFunction('product-activation.js', request, response)
  if (target.api === 'public-app-handoff') return runNodeFunction('public-app-handoff.js', request, response)
  if (target.redirect) {
    response.writeHead(308, { location: target.redirect })
    response.end()
    return undefined
  }
  if (!target.filePath || !existsSync(target.filePath)) return send(response, 404, 'not found')

  const type = contentTypes.get(extname(target.filePath).toLowerCase()) || 'application/octet-stream'
  return send(response, 200, readFileSync(target.filePath), type)
})

server.listen(port, host, () => {
  console.log(`public_output_server=http://${host}:${port}`)
})
