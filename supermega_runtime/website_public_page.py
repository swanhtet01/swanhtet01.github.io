"""Render one approved Sites page with a same-origin, retry-safe inquiry form."""

from html import escape
from secrets import token_urlsafe

from fastapi.responses import HTMLResponse


_STYLE = """*{box-sizing:border-box}body{margin:0;background:#f8f9fc;color:#182030;font:16px/1.65 system-ui,'Noto Sans Myanmar',sans-serif}header,main,footer{max-width:1040px;margin:auto;padding:24px}header{border-bottom:1px solid #e3e7ef;font-weight:700}section{padding:40px 0}h1{font-size:clamp(32px,5vw,60px);line-height:1.25;letter-spacing:-.035em;max-width:850px}h2{font-size:26px;line-height:1.4}p{max-width:720px;white-space:pre-wrap;color:#596377}.eyebrow{color:#4f46df;font-weight:600}form{max-width:660px;padding:28px;background:#fff;border:1px solid #e3e7ef;border-radius:16px}fieldset{padding:0;margin:0;border:0}label{display:block;margin-bottom:18px;font-weight:600}input,textarea{display:block;width:100%;margin-top:6px;border:1px solid #cbd2df;background:white;border-radius:8px;padding:12px;font:inherit;color:inherit}textarea{resize:vertical}.consent{display:flex;gap:10px;align-items:flex-start;font-size:14px;font-weight:400}.consent input{width:20px;height:20px;flex-shrink:0}button{border:0;border-radius:8px;padding:13px 24px;background:#4f46df;color:#fff;font:600 16px system-ui;min-height:48px;cursor:pointer}button:disabled{opacity:.6}a{color:#4f46df}input:focus-visible,textarea:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #8580ef;outline-offset:3px}#status{margin-bottom:0}footer{font-size:13px;color:#596377}@media(max-width:600px){header,main,footer{padding:20px}section{padding:24px 0}form{padding:20px}}"""

_SCRIPT = """
const form = document.querySelector('form');
const fields = form.querySelector('fieldset');
const button = form.querySelector('button');
const status = document.getElementById('status');
let pending = null;
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  if (!pending) {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    pending = { requestId: crypto.randomUUID(), name: data.get('name').trim(),
      contact: data.get('contact').trim(), message: data.get('message').trim(),
      consent: data.get('consent') === 'on' };
  }
  fields.disabled = true;
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    const response = await fetch(form.action, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify(pending) });
    if (response.ok) {
      const receipt = await response.json();
      if (receipt.status !== 'received' || receipt.requestId !== pending.requestId) throw Error('receipt');
      status.textContent = 'Your message has been received. Thank you.';
      button.textContent = 'Message received';
      return;
    }
    if (response.status === 404) {
      status.textContent = 'This contact form is no longer available.';
      return;
    }
    if (response.status === 422 || response.status === 409) {
      pending = null;
      fields.disabled = false;
      status.textContent = 'Please check your details and send again.';
    } else {
      status.textContent = response.status === 429
        ? 'Please wait a few minutes, then retry your message.'
        : 'We could not confirm delivery. Retry to check the same message.';
    }
  } catch {
    status.textContent = 'We could not confirm delivery. Retry to check the same message.';
  }
  button.disabled = false;
  button.textContent = pending ? 'Retry message' : 'Send message';
});
"""


def render_website_inquiry_page(record: dict) -> HTMLResponse:
    artifact = record['artifact']
    page = next(page for page in artifact['pages'] if page['id'] == record['pageId'])
    def text(value):
        return escape(str(value), quote=True)
    nonce = token_urlsafe(24)
    sections = ''.join(f"<section><h2>{text(item['title'])}</h2><p>{text(item['body'])}</p></section>" for item in page['sections'])
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{text(page['seo']['title'])}</title><meta name="description" content="{text(page['seo']['description'])}"><style nonce="{nonce}">{_STYLE}</style></head><body>
<header>{text(artifact['siteName'])}</header><main><section><span class="eyebrow">{text(page['hero']['eyebrow'])}</span><h1>{text(page['hero']['headline'])}</h1><p>{text(page['hero']['summary'])}</p><a href="#contact">Contact us</a></section>{sections}
<section id="contact"><h2>Get in touch</h2><form method="post" action="/api/public/sites/{text(record['channelId'])}/inquiries"><fieldset><label>Name<input name="name" autocomplete="name" maxlength="80" required></label><label>Email or phone<input name="contact" autocomplete="email" maxlength="120" required></label><label>Message<textarea name="message" rows="4" maxlength="500" required></textarea></label><label class="consent"><input name="consent" type="checkbox" required><span>I agree to share these details with {text(artifact['siteName'])} so they can respond.</span></label></fieldset><button type="submit">Send message</button><p id="status" role="status" aria-live="polite"></p><noscript>Enable JavaScript to send this form.</noscript></form></section></main><footer>{text(artifact['siteName'])}</footer><script nonce="{nonce}">{_SCRIPT}</script></body></html>"""
    return HTMLResponse(html, headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; "
            f"script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; connect-src 'self'; form-action 'self'",
    })
