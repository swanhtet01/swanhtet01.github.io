module.exports = function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.statusCode = 405
    res.setHeader('Allow', 'GET, HEAD')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ ok: false, status: 'method_not_allowed', service: 'supermega-public-site' }))
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  res.end(JSON.stringify({ ok: true, status: 'ready', service: 'supermega-public-site' }))
}
