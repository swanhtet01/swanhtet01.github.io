module.exports = function handler(_req, res) {
  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ status: 'not_found', detail: 'Not found.' }))
}
