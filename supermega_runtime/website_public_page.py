"""Render approved Sites pages with navigation and one attributed contact form."""

from html import escape
from secrets import token_urlsafe
from urllib.parse import quote

from fastapi.responses import HTMLResponse

from .website_runtime import _page_anchor, _safe_https_destination


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


_STYLE += """
header{display:flex;align-items:center;justify-content:space-between;gap:24px}
.brand{color:#182030;text-decoration:none;overflow-wrap:anywhere}
nav{display:flex;flex-wrap:wrap;gap:8px}nav a{padding:8px 12px;border-radius:8px;text-decoration:none;color:#596377;font-weight:500}
nav a[aria-current=page]{background:#eeedff;color:#4338ca}nav a:hover{background:#eeedff}
.hero{padding:64px 0 40px}.hero h1{margin:16px 0 24px}.hero p{font-size:19px;line-height:1.7}
.cta{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:10px 22px;border-radius:8px;background:#4f46df;color:white;text-decoration:none;font-weight:600;margin-top:16px}
.content-section{border-top:1px solid #e3e7ef}.content-section h2{margin-top:10px}
footer{display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:1px solid #e3e7ef}
.skip-link{position:absolute;left:20px;top:-100px;padding:12px;background:white;z-index:1}.skip-link:focus{top:12px}
@media(max-width:600px){header{align-items:flex-start;flex-direction:column;gap:12px}nav{gap:4px}nav a{padding:8px 10px}.hero{padding:32px 0}.hero p{font-size:17px}}
"""


def render_website_inquiry_page(record: dict, page_path: str = '/') -> HTMLResponse | None:
    artifact = record['artifact']
    # Only retained, approved artifact pages are routable. Never consult the
    # mutable draft here or accept a visitor-selected inquiry source page.
    pages = {page['slug']: page for page in artifact['pages']}
    page = pages.get(page_path.rstrip('/') or '/')
    if page is None:
        return None
    contact_page = next(page for page in pages.values() if page['id'] == record['pageId'])
    base = f"/sites/{quote(str(record['channelId']), safe='')}"

    def text(value):
        return escape(str(value), quote=True)

    def page_url(slug):
        return base if slug == '/' else base + quote(slug, safe='/')

    def destination_url(destination):
        destination = destination.strip()
        if destination.startswith('#'):
            target = next((item for slug, item in pages.items() if _page_anchor(slug) == destination[1:]), None)
            return page_url(target['slug']) if target else None
        if destination.startswith('/') and (destination.rstrip('/') or '/') in pages:
            return page_url(destination.rstrip('/') or '/')
        return destination if _safe_https_destination(destination) else None

    nonce = token_urlsafe(24)
    navigation = ''.join(
        f'<a href="{text(page_url(item["slug"]))}"' + (' aria-current="page"' if item['id'] == page['id'] else '')
        + f'>{text(item["navigation"]["label"])}</a>'
        for item in pages.values() if item['navigation']['visible'])
    sections = ''.join(f"<section class=\"content-section\"><span class=\"eyebrow\">{text(item['eyebrow'])}</span><h2>{text(item['title'])}</h2><p>{text(item['body'])}</p></section>" for item in page['sections'])
    destination = destination_url(page['hero']['ctaHref'])
    cta = f'<a class="cta" href="{text(destination)}">{text(page["hero"]["ctaLabel"])}</a>' if destination and page['hero']['ctaLabel'].strip() else ''
    contact_url = page_url(contact_page['slug']) + '#inquiry-form'
    form = ''
    script = ''
    if page['id'] == contact_page['id']:
        form = f"""<section id="inquiry-form"><h2>Get in touch</h2><form method="post" action="/api/public/sites/{text(record['channelId'])}/inquiries"><fieldset><label>Name<input name="name" autocomplete="name" maxlength="80" required></label><label>Email or phone<input name="contact" autocomplete="email" maxlength="120" required></label><label>Message<textarea name="message" rows="4" maxlength="500" required></textarea></label><label class="consent"><input name="consent" type="checkbox" required><span>I agree to share these details with {text(artifact['siteName'])} so they can respond.</span></label></fieldset><button type="submit">Send message</button><p id="status" role="status" aria-live="polite"></p><noscript>Enable JavaScript to send this form.</noscript></form></section>"""
        script = f'<script nonce="{nonce}">{_SCRIPT}</script>'
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{text(page['seo']['title'])}</title><meta name="description" content="{text(page['seo']['description'])}"><style nonce="{nonce}">{_STYLE}</style></head><body>
<a class="skip-link" href="#main">Skip to content</a><header><a class="brand" href="{text(base)}">{text(artifact['siteName'])}</a><nav aria-label="Primary navigation">{navigation}</nav></header><main id="main" tabindex="-1"><section class="hero"><span class="eyebrow">{text(page['hero']['eyebrow'])}</span><h1>{text(page['hero']['headline'])}</h1><p>{text(page['hero']['summary'])}</p>{cta}</section>{sections}{form}</main><footer><span>{text(artifact['siteName'])}</span><a href="{text(contact_url)}">Contact us</a></footer>{script}</body></html>"""
    return HTMLResponse(html, headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; "
            f"script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; connect-src 'self'; form-action 'self'",
    })
