"""Render approved Sites pages with navigation and one attributed contact form."""

from html import escape
from secrets import token_urlsafe
from unicodedata import category
from urllib.parse import quote

from fastapi.responses import HTMLResponse

from .website_runtime import _page_anchor, _safe_https_destination, _validate_image_block


from .website_presentation import WEBSITE_PUBLIC_CSS as _STYLE


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

    # The artifact has no locale field yet. Derive the document language from
    # readable, approved text so Myanmar customers get the right browser and
    # screen-reader language without letting markup, identifiers or CSS bias it.
    readable = [artifact['siteName']]
    for published_page in pages.values():
        readable.extend((published_page['navigation']['label'], published_page['hero']['eyebrow'],
                         published_page['hero']['headline'], published_page['hero']['summary'],
                         published_page['seo']['title'], published_page['seo']['description']))
        for section in published_page['sections']:
            readable.extend((section['eyebrow'], section['title'], section['body']))
    letters = [character for value in readable for character in str(value) if category(character).startswith('L')]
    myanmar_letters = sum(ord(character) in range(0x1000, 0x10A0)
                           or ord(character) in range(0xA9E0, 0xAA00)
                           or ord(character) in range(0xAA60, 0xAA80)
                           for character in letters)
    language = 'my' if letters and myanmar_letters / len(letters) > 0.5 else 'en'

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
    def image_html(item, *, priority=False):
        if 'image' not in item:
            return ''
        _validate_image_block({'image': item['image']}, 'Published image', frozenset())
        image = item['image']
        source = (f"/api/public/sites/{quote(str(record['channelId']), safe='')}/media/{image['assetId']}"
                  if 'assetId' in image else image['src'])
        loading = 'eager' if priority else 'lazy'
        return (f'<img class="content-image" src="{text(source)}" alt="{text(image["alt"])}"'
                f' width="800" height="500" loading="{loading}" decoding="async" referrerpolicy="no-referrer">')

    def section_html(item):
        photo = image_html(item)
        layout = 'content-section has-image' if photo else 'content-section'
        return (f'<section class="{layout}">{photo}<div class="section-copy">'
                f'<p class="eyebrow">{text(item["eyebrow"])}</p><h2>{text(item["title"])}</h2>'
                f'<p>{text(item["body"])}</p></div></section>')

    sections = ''.join(section_html(item) for item in page['sections'])
    destination = destination_url(page['hero']['ctaHref'])
    external = ' target="_blank" rel="noopener noreferrer"' if destination and _safe_https_destination(destination) else ''
    external_notice = '<span class="visually-hidden"> (opens in a new tab)</span>' if external else ''
    cta = f'<a class="cta" href="{text(destination)}"{external}>{text(page["hero"]["ctaLabel"])} <span aria-hidden="true">→</span>{external_notice}</a>' if destination and page['hero']['ctaLabel'].strip() else ''
    contact_url = page_url(contact_page['slug']) + '#inquiry-form'
    form = ''
    script = ''
    if page['id'] == contact_page['id']:
        form = f"""<section class="inquiry-section" id="inquiry-form"><h2>Get in touch</h2><form class="inquiry-form" method="post" action="/api/public/sites/{text(record['channelId'])}/inquiries"><fieldset><label>Name<input name="name" autocomplete="name" maxlength="80" required></label><label>Email or phone<input name="contact" autocomplete="email" maxlength="120" required></label><label>Message<textarea name="message" rows="4" maxlength="500" required></textarea></label><label class="consent"><input name="consent" type="checkbox" required><span>I agree to share these details with {text(artifact['siteName'])} so they can respond.</span></label></fieldset><button type="submit">Send message</button><p class="inquiry-status" id="status" role="status" aria-live="polite"></p><noscript>Enable JavaScript to send this form.</noscript></form></section>"""
        script = f'<script nonce="{nonce}">{_SCRIPT}</script>'
    hero_photo = image_html(page['hero'], priority=True)
    html = f"""<!doctype html><html lang="{language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{text(page['seo']['title'])}</title><meta name="description" content="{text(page['seo']['description'])}"><style nonce="{nonce}">{_STYLE}</style></head><body class="sm-site">
<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><div class="site-header-inner"><a class="site-name" href="{text(base)}">{text(artifact['siteName'])}</a><nav class="site-nav" aria-label="Primary navigation">{navigation}</nav></div></header><main class="site-main" id="main" tabindex="-1"><article class="site-page"><section class="hero">{hero_photo}<p class="eyebrow">{text(page['hero']['eyebrow'])}</p><h1>{text(page['hero']['headline'])}</h1><p class="summary">{text(page['hero']['summary'])}</p>{cta}</section><div class="section-grid">{sections}</div>{form}</article></main><footer class="site-footer"><span>{text(artifact['siteName'])}</span><a href="{text(contact_url)}">Contact us</a></footer>{script}</body></html>"""
    return HTMLResponse(html, headers={
        'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; "
            f"script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; img-src 'self' https:; connect-src 'self'; form-action 'self'",
    })
