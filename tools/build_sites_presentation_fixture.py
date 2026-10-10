"""Finish the shared local parity fixture with the real Python renderer.

Run the paired .mjs builder first. Local synthetic pages, not deployment proof.
"""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from supermega_runtime.website_public_page import render_website_inquiry_page
from supermega_runtime.website_presentation import WEBSITE_PUBLIC_CSS, WEBSITE_PRESENTATION_DIGEST

out = ROOT / '.tmp/qa-workspaces'
artifact = json.loads((out / 'parity/artifact.json').read_text(encoding='utf-8'))
channel = '98f6c3a8-b36a-4d81-9227-e1f4f5d862c0'
contact = next(page for page in artifact['pages'] if page['slug'] == '/contact')
record = {'channelId': channel, 'pageId': contact['id'], 'artifact': artifact}
for page in artifact['pages']:
    response = render_website_inquiry_page(record, page['slug'])
    html = response.body.decode()
    assert WEBSITE_PUBLIC_CSS in html
    target = out / 'sites' / channel / page['slug'].strip('/') / 'index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding='utf-8')
photo = (out / 'parity/photo.webp').read_bytes()
asset = hashlib.sha256(photo).hexdigest() + '.webp'
target = out / 'api/public/sites' / channel / 'media' / asset
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(photo)
assert WEBSITE_PUBLIC_CSS in (out / 'parity/export.html').read_text(encoding='utf-8')
print(json.dumps({'ok': True, 'presentationDigest': WEBSITE_PRESENTATION_DIGEST,
                  'equalHostedAndExportStyles': True, 'syntheticVisualFixture': True}))
