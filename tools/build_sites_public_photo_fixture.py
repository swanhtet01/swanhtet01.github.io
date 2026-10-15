"""Render actual published-page HTML for local visual QA with synthetic content.

Reuses an existing static QA server. Image files stand in for the protected media
endpoint; this fixture does not prove HTTP authorization or inquiry delivery.
The real API/database tests cover those separately. Never publish this fixture.
"""
from hashlib import sha256
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from supermega_runtime.website_public_page import render_website_inquiry_page
from supermega_runtime.website_runtime import _website_artifact
from tests.test_website_runtime import _page, _state


def build():
    output = ROOT / '.tmp/qa-workspaces'
    photo = ROOT / '.tmp/sites-private-editor-review-20261010/synthetic-photo.webp'
    photo_bytes = photo.read_bytes()
    asset_id = sha256(photo_bytes).hexdigest() + '.webp'
    channel = '98f6c3a8-b36a-4d81-9227-e1f4f5d862c0'
    state = _state()
    state['siteName'] = 'Corner Café · QA'
    home, contact = _page(), _page('page-contact', '/contact')
    home['navigation']['label'] = 'Home'
    home['hero'].update(eyebrow='A little time for yourself', headline='Good mornings start here.',
                        summary='Fresh fruit, a warm welcome and a place to pause.',
                        ctaLabel='Plan your visit', ctaHref='/contact')
    home['sections'][0].update(eyebrow='Fresh every day', title='Simple things, done well.',
                              body='Seasonal ingredients. Thoughtful service. Room for good conversation.',
                              image={'assetId': asset_id, 'alt': 'Fresh grapefruit, ready for breakfast', 'decorative': False})
    home['seo'].update(title='Corner Café · Synthetic QA', description='Local renderer verification only.')
    contact['navigation']['label'] = 'Contact'
    contact['hero'].update(eyebrow='Come say hello', headline='Make a little room in your day.',
                           summary='Send a question or tell us when you would like to visit.', ctaLabel='', ctaHref='')
    contact['sections'][0].update(eyebrow='Synthetic test page', title='We would love to hear from you.',
                                 body='This local visual fixture does not send messages.')
    contact['seo'].update(title='Contact · Synthetic QA', description='Local form layout only.')
    state['pages'] = [home, contact]
    artifact = _website_artifact(state)
    record = {'channelId': channel, 'pageId': 'page-contact', 'artifact': artifact}
    files = []
    for path in ('/', '/contact'):
        response = render_website_inquiry_page(record, path)
        target = output / 'sites' / channel / path.strip('/') / 'index.html'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(response.body)
        files.append({'path': str(target.relative_to(ROOT)), 'sha256': sha256(response.body).hexdigest()})
    image = output / 'api/public/sites' / channel / 'media' / asset_id
    image.parent.mkdir(parents=True, exist_ok=True)
    image.write_bytes(photo_bytes)
    files.append({'path': str(image.relative_to(ROOT)), 'sha256': sha256(photo_bytes).hexdigest()})
    evidence = ROOT / '.tmp/sites-publishing-media-review-20261010'
    evidence.mkdir(parents=True, exist_ok=True)
    report = {'scope': 'actual renderer, synthetic content, static image fixture; visual QA only',
              'url': f'http://127.0.0.1:4177/sites/{channel}/', 'files': files,
              'rendererSha256': sha256((ROOT / 'supermega_runtime/website_public_page.py').read_bytes()).hexdigest()}
    (evidence / 'visual-fixture.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))


if __name__ == '__main__':
    build()
