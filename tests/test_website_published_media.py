"""Publication-scoped photo checks; real PostgreSQL, synthetic object storage.

SUPERMEGA_TEST_POSTGRES=1 SUPERMEGA_TRIAL_SCHEMA_VERSION=13
python -m unittest tests.test_website_published_media -v
"""
from copy import deepcopy
from pathlib import Path
import json
import unittest
from uuid import uuid4

from supermega_runtime.trial_store import TrialNotFound, TrialNotReadyError, TrialValidationError
from supermega_runtime.website_inquiry_store import WebsiteInquiryStore
from supermega_runtime.website_media_store import WebsiteMediaStore
from supermega_runtime.website_public_page import render_website_inquiry_page
from supermega_runtime.website_runtime import _website_artifact
from tests.test_website_media_postgres import LocalWebsiteDatabaseCase
from tests.test_website_runtime import _published_state, _state
from tools import rehearse_supermega_postgres17 as pg

ORIGIN = 'https://synthetic.example'


class PublishedPhotoRenderingTests(unittest.TestCase):
    def test_private_and_linked_photos_keep_description_and_decorative_choice(self):
        state = _state()
        first = state['pages'][0]['sections'][0]
        first['image'] = {'assetId': 'a' * 64 + '.webp', 'alt': 'Table & chairs <inside>', 'decorative': False}
        second = deepcopy(first)
        second.update(id='second', image={'src': 'https://images.example.com/cafe.webp', 'alt': '', 'decorative': True})
        state['pages'][0]['sections'].append(second)
        channel = str(uuid4())
        response = render_website_inquiry_page({'channelId': channel, 'pageId': 'page-home',
                                              'artifact': _website_artifact(state)})
        html = response.body.decode()
        self.assertIn(f'/api/public/sites/{channel}/media/' + 'a' * 64 + '.webp', html)
        self.assertIn('alt="Table &amp; chairs &lt;inside&gt;"', html)
        self.assertIn('src="https://images.example.com/cafe.webp" alt=""', html)
        self.assertEqual(html.count('class="content-image"'), 2)
        self.assertIn("img-src 'self' https:", response.headers['content-security-policy'])
        self.assertNotIn('blob:', html)
        self.assertNotIn('supabase.co', html)

    def test_hero_photo_is_retained_and_loaded_before_section_photos(self):
        state = _state()
        state['pages'][0]['hero']['image'] = {
            'assetId': 'b' * 64 + '.webp', 'alt': 'Cafe entrance', 'decorative': False,
        }
        state['pages'][0]['sections'][0]['image'] = {
            'src': 'https://images.example.com/table.webp', 'alt': '', 'decorative': True,
        }
        response = render_website_inquiry_page({'channelId': str(uuid4()), 'pageId': 'page-home',
                                              'artifact': _website_artifact(state)})
        html = response.body.decode()
        self.assertLess(html.index('alt="Cafe entrance"'), html.index('<h1>'))
        self.assertIn('loading="eager"', html)
        self.assertIn('loading="lazy"', html)
        self.assertEqual(html.count('class="content-image"'), 2)
        self.assertIn('<body class="sm-site">', html)

    def test_invalid_hero_photo_is_rejected(self):
        artifact = _website_artifact(_state())
        artifact['pages'][0]['hero']['image'] = {'src': 'javascript:alert(1)', 'alt': 'Bad', 'decorative': False}
        with self.assertRaises(TrialValidationError):
            render_website_inquiry_page({'channelId': str(uuid4()), 'pageId': 'page-home', 'artifact': artifact})

    def test_invalid_image_reference_fails_instead_of_disappearing(self):
        artifact = _website_artifact(_state())
        section = artifact['pages'][0]['sections'][0]
        for image in (
            {'src': 'javascript:alert(1)', 'alt': 'Bad', 'decorative': False},
            {'assetId': '../private.webp', 'alt': 'Bad', 'decorative': False},
            {'assetId': 'a' * 64 + '.webp', 'src': 'https://example.com/p.webp', 'alt': 'Bad', 'decorative': False},
        ):
            section['image'] = image
            with self.subTest(image=image), self.assertRaises(TrialValidationError):
                render_website_inquiry_page({'channelId': str(uuid4()), 'pageId': 'page-home', 'artifact': artifact})


class PublishedMediaPostgresTests(LocalWebsiteDatabaseCase):
    def setUp(self):
        super().setUp()
        self.adapter = WebsiteInquiryStore(self.store, media_storage=self.storage)

    def test_catalog_drift_closes_every_publication_entrypoint(self):
        from supermega_runtime.trial_store import TrialNotReadyError
        channel = self._channel()
        function = 'app_private.read_website_inquiry_page(uuid,text)'
        original = self._sql('select pg_get_functiondef(%s::regprocedure)', (function,))[0][0]
        cases = [
            ('alter table app_private.website_inbox disable row level security',
             'alter table app_private.website_inbox enable row level security'),
            ('grant select on app_private.website_inbox to public',
             'revoke select on app_private.website_inbox from public'),
            ('grant select (message) on app_private.website_inbox to anon',
             'revoke select (message) on app_private.website_inbox from anon'),
            ('drop index app_private.website_inbox_client_received_idx',
             'create index website_inbox_client_received_idx on app_private.website_inbox(workspace_id,client_key,received_at)'),
            (f'alter function {function} security invoker', original),
            (f'alter function {function} set search_path=public', original),
            (original.replace('select jsonb_build_object', 'select /* unexpected definition */ jsonb_build_object'), original),
            (f'grant execute on function {function} to public', f'revoke execute on function {function} from public'),
        ]
        for change, restore in cases:
            with self.subTest(change=change[:75]):
                self._sql(change)
                try:
                    operations = (
                        lambda: self.adapter.public_page(channel_id=channel, public_origin=ORIGIN),
                        lambda: self.adapter.public_photo(channel_id=channel, public_origin=ORIGIN, asset_id=self.photo.asset_id),
                        lambda: self.adapter.inbox(self.owner),
                        lambda: self.adapter.publications(self.owner, public_origin=ORIGIN),
                        lambda: self.adapter.prepare_channel(self.owner, channel_id=str(uuid4()), page_id='page-home', expected_version=1, origin=ORIGIN),
                        lambda: self.adapter.publish_channel(self.owner, channel_id=channel, expected_version=1, public_origin=ORIGIN),
                        lambda: self.adapter.unpublish_channel(self.owner, channel_id=channel, artifact_digest='sha256:'+'a'*64),
                        lambda: self.adapter.receive(channel_id=channel, request_id=str(uuid4()), origin=ORIGIN,
                            payload={'name': 'QA', 'contact': 'qa@example.test', 'message': 'Synthetic request', 'consent': True}, client_key='a'*64),
                    )
                    for operation in operations:
                        with self.assertRaises(TrialNotReadyError):
                            operation()
                finally:
                    self._sql(restore)
                self.assertIsNotNone(self.adapter.public_page(channel_id=channel, public_origin=ORIGIN))

    def test_publication_status_is_workspace_scoped_and_survives_withdrawal(self):
        channel = self._channel()
        result = self.adapter.publications(self.owner, public_origin=ORIGIN)
        self.assertEqual(result['publicOrigin'], ORIGIN)
        self.assertEqual(len(result['publications']), 1)
        record = result['publications'][0]
        self.assertEqual(record['channelId'], channel)
        self.assertTrue(record['enabled'])
        self.assertEqual(self.adapter.publications(self._principal(), public_origin=ORIGIN)['publications'], [])
        self.adapter.unpublish_channel(self.owner, channel_id=channel, artifact_digest=record['artifactDigest'])
        self.assertFalse(self.adapter.publications(self.owner, public_origin=ORIGIN)['publications'][0]['enabled'])

    def test_changing_contact_page_retires_the_entire_previous_publication(self):
        self.media.put(self.owner, self.photo)
        state = _state()
        contact = deepcopy(state['pages'][0]); contact['id'] = 'page-contact'; contact['slug'] = '/contact'
        for section in contact['sections']:
            section['id'] += '-contact'
        state['pages'].append(contact)
        self._sql("""insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by)
            values(%s,'website',1,%s::jsonb,%s)""", (self.owner.workspace_id, json.dumps(_published_state(state)), self.owner.actor_id))
        channels = [str(uuid4()), str(uuid4())]
        for channel, page in zip(channels, ('page-home', 'page-contact')):
            self.adapter.prepare_channel(self.owner, channel_id=channel, page_id=page, expected_version=1, origin=ORIGIN)
            self.adapter.publish_channel(self.owner, channel_id=channel, expected_version=1, public_origin=ORIGIN)
        self.assertIsNone(self.adapter.public_page(channel_id=channels[0], public_origin=ORIGIN))
        self.assertIsNotNone(self.adapter.public_page(channel_id=channels[1], public_origin=ORIGIN))
        records = self.adapter.publications(self.owner, public_origin=ORIGIN)
        live = [record for record in records['publications'] if record['enabled']]
        self.assertEqual([record['channelId'] for record in live], [channels[1]])
        self.adapter.unpublish_channel(self.owner, channel_id=channels[1], artifact_digest=live[0]['artifactDigest'])
        self.assertFalse(any(record['enabled'] for record in self.adapter.publications(self.owner, public_origin=ORIGIN)['publications']))

    def _channel(self, *, publish=True, image=None, upload=True, hero=False):
        if upload:
            self.media.put(self.owner, self.photo)
        state = _state()
        photo_block = state['pages'][0]['hero'] if hero else state['pages'][0]['sections'][0]
        photo_block['image'] = image or {
            'assetId': self.photo.asset_id, 'alt': 'A warm place for customers', 'decorative': False}
        # The approved snapshot is synthetic test input. Publication, media
        # access and withdrawal use real runtime guards and SQL transactions.
        self._sql("""insert into app_private.workspace_state
            (workspace_id,surface,version,state_json,updated_by) values(%s,'website',1,%s::jsonb,%s)""",
            (self.owner.workspace_id, json.dumps(_published_state(state)), self.owner.actor_id))
        channel = str(uuid4())
        self.adapter.prepare_channel(self.owner, channel_id=channel, page_id='page-home',
                                     expected_version=1, origin=ORIGIN)
        if publish:
            self._publish(channel)
        return channel

    def _publish(self, channel):
        return self.adapter.publish_channel(self.owner, channel_id=channel,
                                            expected_version=1, public_origin=ORIGIN)

    def _read(self, channel, asset=None, origin=ORIGIN):
        return self.adapter.public_photo(channel_id=channel, public_origin=origin,
                                          asset_id=asset or self.photo.asset_id)

    def _withdraw(self, channel):
        record = self.adapter.public_page(channel_id=channel, public_origin=ORIGIN)
        return self.adapter.unpublish_channel(self.owner, channel_id=channel,
                                               artifact_digest=record['artifactDigest'])

    def _client(self, *, enabled=True):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from supermega_runtime.website_inquiry_api import create_website_inquiry_router
        app = FastAPI()
        app.include_router(create_website_inquiry_router(
            store=self.adapter, enabled=enabled, resolve_principal=lambda _: self.owner,
            resolve_client_address=lambda _: '192.0.2.1', abuse_key=bytes(range(32)), public_origin=ORIGIN))
        return TestClient(app)

    def test_http_published_photo_bytes_and_inquiry_arrive_in_same_workspace(self):
        channel = self._channel()
        with self._client() as client:
            page = client.get(f'/sites/{channel}')
            path = f'/api/public/sites/{channel}/media/{self.photo.asset_id}'
            self.assertEqual(page.status_code, 200)
            self.assertIn(path, page.text)
            self.assertNotIn(self.owner.workspace_id, page.text)
            photo = client.get(path)
            self.assertEqual(photo.status_code, 200, photo.text[:100] if photo.status_code != 200 else '')
            self.assertEqual(photo.content, self.photo.data)
            self.assertEqual(photo.headers['content-type'], 'image/webp')
            self.assertEqual(photo.headers['cache-control'], 'private, no-store')
            self.assertEqual(photo.headers['x-content-type-options'], 'nosniff')
            self.assertEqual(photo.headers['cross-origin-resource-policy'], 'same-origin')
            request_id = str(uuid4())
            sent = client.post(f'/api/public/sites/{channel}/inquiries', headers={'Origin': ORIGIN},
                json={'requestId': request_id, 'name': 'မောင်မောင်', 'contact': 'synthetic@example.test',
                      'message': 'စျေးနှုန်း သိချင်ပါတယ်။', 'consent': True})
            self.assertEqual(sent.status_code, 200, sent.text)
            inbox = self.adapter.inbox(self.owner)
            self.assertEqual(inbox['inquiries'][0]['requestId'], request_id)
            self.assertEqual(inbox['inquiries'][0]['sourcePage'], '/')
            self.assertEqual(client.get(path + '?workspace_id=other').status_code, 422)

    def test_unpublished_unknown_wrong_origin_and_unlisted_photos_do_not_read_storage(self):
        channel = self._channel(publish=False)
        unlisted = self._photo('#006677')
        self.media.put(self.owner, unlisted)
        before = self.storage.get_count
        for candidate, asset, origin in ((channel, None, ORIGIN), (str(uuid4()), None, ORIGIN)):
            with self.assertRaises(TrialNotFound):
                self._read(candidate, asset, origin)
        self.assertEqual(self.storage.get_count, before)
        self._publish(channel)
        before = self.storage.get_count
        for asset, origin in ((None, 'https://wrong.example'), (unlisted.asset_id, ORIGIN), ('f' * 64 + '.webp', ORIGIN)):
            with self.assertRaises(TrialNotFound):
                self._read(channel, asset, origin)
        self.assertEqual(self.storage.get_count, before)

    def test_hero_only_photo_is_public_only_while_its_approved_site_is_live(self):
        channel = self._channel(hero=True, publish=False)
        with self._client() as client:
            path = f'/api/public/sites/{channel}/media/{self.photo.asset_id}'
            self.assertEqual(client.get(path).status_code, 404)
            self.assertEqual(self.storage.get_count, 0)
            self._publish(channel)
            page = client.get(f'/sites/{channel}')
            self.assertEqual(page.status_code, 200)
            self.assertEqual(page.text.count(path), 1)
            self.assertLess(page.text.index(path), page.text.index('<h1>'))
            photo = client.get(path)
            self.assertEqual(photo.status_code, 200)
            self.assertEqual(photo.content, self.photo.data)
            self._withdraw(channel)
            before = self.storage.get_count
            self.assertEqual(client.get(path).status_code, 404)
            self.assertEqual(self.storage.get_count, before)

    def test_foreign_hero_photo_receipt_does_not_authorize_publication(self):
        self.media.put(self._principal(), self.photo)
        channel = self._channel(hero=True, publish=False, upload=False)
        with self.assertRaises(TrialValidationError):
            self._publish(channel)
        with self.assertRaises(TrialNotFound):
            self._read(channel)
        self.assertEqual(self.storage.get_count, 0)

    def test_foreign_receipt_cannot_authorize_publication_or_public_image(self):
        other = self._principal()
        WebsiteMediaStore(self.store, self.storage).put(other, self.photo)
        channel = self._channel(upload=False, publish=False)
        with self.assertRaises(TrialValidationError):
            self._publish(channel)
        self.assertIsNone(self.adapter.public_page(channel_id=channel, public_origin=ORIGIN))
        # Even an old/imported approved artifact cannot turn a foreign receipt
        # into this tenant's photo; test the public SQL guard independently.
        state = self._sql("select state_json from app_private.workspace_state where workspace_id=%s and surface='website'",
                          (self.owner.workspace_id,))[0][0]
        artifact = state['localPublishes'][0]['artifact']
        self._sql("""update app_private.website_inquiry_channels set enabled=true,
            published_artifact=%s::jsonb,artifact_digest=%s,snapshot_id='test',published_by='test',published_at=clock_timestamp()
            where channel_id=%s""", (json.dumps(artifact), 'sha256:' + '0' * 64, channel))
        with self.assertRaises(TrialNotFound):
            self._read(channel)
        self.assertEqual(self.storage.get_count, 0)

    def test_withdrawal_during_provider_read_returns_no_bytes(self):
        channel = self._channel()
        self.storage.after_get = lambda: self._withdraw(channel)
        with self._client() as client:
            response = client.get(f'/api/public/sites/{channel}/media/{self.photo.asset_id}')
            self.assertEqual(response.status_code, 404)
            self.assertNotIn(self.photo.data, response.content)
            self.assertEqual(client.get(f'/sites/{channel}').status_code, 404)

    def test_workspace_suspension_during_provider_read_returns_no_bytes(self):
        channel = self._channel()
        self.storage.after_get = lambda: self._sql(
            "update app_private.workspace_access_controls set status='suspended' where workspace_id=%s",
            (self.owner.workspace_id,))
        with self.assertRaises(TrialNotFound):
            self._read(channel)
        self.assertIsNone(self.adapter.public_page(channel_id=channel, public_origin=ORIGIN))

    def test_missing_or_corrupt_bytes_prevent_publication_and_never_leak(self):
        channel = self._channel(publish=False)
        key = self.owner.workspace_id, self.photo.asset_id
        self.storage.objects[key] = self.photo.data[:-1] + bytes([self.photo.data[-1] ^ 1])
        with self.assertRaises(TrialNotReadyError):
            self._publish(channel)
        self.assertIsNone(self.adapter.public_page(channel_id=channel, public_origin=ORIGIN))
        self.storage.objects[key] = self.photo.data
        self._publish(channel)
        self.storage.objects[key] = b'x' * len(self.photo.data)
        with self._client() as client:
            response = client.get(f'/api/public/sites/{channel}/media/{self.photo.asset_id}')
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()['detail'], 'website_inquiries_unavailable')

    def test_media_configuration_and_browser_role_boundaries(self):
        channel = self._channel(publish=False)
        self.adapter.media_storage = None
        with self.assertRaises(TrialNotReadyError):
            self._publish(channel)
        self.assertIsNone(self.adapter.public_page(channel_id=channel, public_origin=ORIGIN))
        for role in ('anon', 'authenticated', 'service_role'):
            self.assertFalse(self._sql('select has_function_privilege(%s,%s,%s)',
                (role, 'app_private.read_website_published_media(uuid,text,text)', 'execute'))[0][0])
        self.adapter.media_storage = self.storage
        self._publish(channel)
        with self._client(enabled=False) as client:
            self.assertEqual(client.get(f'/api/public/sites/{channel}/media/{self.photo.asset_id}').status_code, 503)


if __name__ == '__main__':
    unittest.main()
