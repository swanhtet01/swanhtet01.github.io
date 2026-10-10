"""Real disposable PostgreSQL only; never uses a supplied or hosted database URL.

Run: SUPERMEGA_RUN_WEBSITE_INQUIRY_SQL=1 SUPERMEGA_TRIAL_SCHEMA_VERSION=13
     python -m unittest tests.test_website_inquiry_sql -v
"""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import subprocess
import unittest
from uuid import uuid4

from tools import rehearse_supermega_postgres17 as pg
from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal, TrialNotReadyError, TrialPermissionDenied, TrialValidationError
from supermega_runtime.website_inquiry_store import WebsiteInquiryStore
from tests.test_website_runtime import _page, _state, _published_state

WORKSPACE = 'rehearsal-product'
OWNER = TrialPrincipal(WORKSPACE, 'owner-product', 'human')
ORIGIN = 'https://synthetic.example'
BODY = {'name': 'မောင်မောင်', 'contact': 'synthetic@example.test', 'message': 'စျေးနှုန်း သိချင်ပါတယ်။', 'consent': True}


def _cta(html):
    class Links(HTMLParser):
        def __init__(self):
            super().__init__()
            self.links, self.current = [], None

        def handle_starttag(self, tag, attrs):
            if tag == 'a':
                self.current = {'attrs': dict(attrs), 'text': ''}
                self.links.append(self.current)

        def handle_endtag(self, tag):
            if tag == 'a':
                self.current = None

        def handle_data(self, data):
            if self.current is not None:
                self.current['text'] += data

    parser = Links()
    parser.feed(html)
    return next(link for link in parser.links if link['attrs'].get('class') == 'cta')


def _multipage_state():
    state = _state()
    state['siteName'] = 'Synthetic Studio'
    state['pages'] = [_page(), _page('page-services', '/services'),
                      _page('page-contact', '/contact'), _page('page-draft', '/private-draft')]
    for page, label in zip(state['pages'], ('Home', 'Services', 'Contact', 'Private draft')):
        page['internalName'] = label
        page['navigation']['label'] = label
        page['hero']['headline'] = f'{label} at Synthetic Studio'
        page['hero']['summary'] = 'Design and support for small business websites.'
        page['seo']['title'] = label + ' | Synthetic Studio'
    state['pages'][0]['hero'].update(ctaLabel='See our services', ctaHref='/services/')
    state['pages'][1]['hero'].update(ctaLabel='Talk to us', ctaHref='#contact')
    state['pages'][2]['hero'].update(ctaLabel='', ctaHref='')
    state['pages'][2]['navigation']['visible'] = False
    state['pages'][3]['stage'] = 'draft'
    state['pages'][3]['navigation']['visible'] = False
    return state


class WebsiteInquiryPageTests(unittest.TestCase):
    def test_approved_navigation_buttons_and_form_have_real_destinations(self):
        from supermega_runtime.website_public_page import render_website_inquiry_page
        from supermega_runtime.website_runtime import _website_artifact
        record = {'channelId': str(uuid4()), 'pageId': 'page-contact',
                  'artifact': _website_artifact(_multipage_state())}
        base = '/sites/' + record['channelId']
        home = render_website_inquiry_page(record).body.decode()
        self.assertIn(f'href="{base}" aria-current="page">Home</a>', home)
        self.assertEqual(_cta(home)['attrs']['href'], f'{base}/services')
        self.assertTrue(_cta(home)['text'].startswith('See our services'))
        self.assertIn(f'href="{base}/contact#inquiry-form"', home)
        self.assertNotIn('<form', home)
        self.assertNotIn('<script', home)
        self.assertNotIn('Private draft', home)
        self.assertNotIn('>Contact</a>', home)  # Hidden in navigation, still an approved CTA destination.
        services = render_website_inquiry_page(record, '/services').body.decode()
        self.assertIn(f'href="{base}/services" aria-current="page">Services</a>', services)
        self.assertEqual(_cta(services)['attrs']['href'], f'{base}/contact')
        self.assertTrue(_cta(services)['text'].startswith('Talk to us'))
        self.assertNotIn('Home at Synthetic Studio', services)
        contact = render_website_inquiry_page(record, '/contact').body.decode()
        self.assertIn('<form', contact)
        self.assertIn(f'action="/api/public/sites/{record["channelId"]}/inquiries"', contact)
        self.assertNotIn('class="cta"', contact)
        for path in ('/private-draft', '/missing', '//services', '/services/extra'):
            self.assertIsNone(render_website_inquiry_page(record, path), path)

    def test_external_buttons_are_escaped_and_unknown_destinations_are_not_links(self):
        from supermega_runtime.website_public_page import render_website_inquiry_page
        from supermega_runtime.website_runtime import _website_artifact
        record = {'channelId': str(uuid4()), 'pageId': 'page-contact',
                  'artifact': _website_artifact(_multipage_state())}
        hero = record['artifact']['pages'][0]['hero']
        hero.update(ctaLabel='Book <now>', ctaHref='https://booking.example/?a=1&b=2')
        html = render_website_inquiry_page(record).body.decode()
        action = _cta(html)
        self.assertEqual(action['attrs']['href'], 'https://booking.example/?a=1&b=2')
        self.assertEqual(action['attrs']['target'], '_blank')
        self.assertEqual(set(action['attrs']['rel'].split()), {'noopener', 'noreferrer'})
        self.assertTrue(action['text'].startswith('Book <now>'))
        self.assertIn('Book &lt;now&gt;', html)
        self.assertNotIn('Book <now>', html)
        for destination in ('javascript:alert(1)', '//elsewhere.example', '/private-draft', '#missing'):
            hero['ctaHref'] = destination
            self.assertNotIn('class="cta"', render_website_inquiry_page(record).body.decode())

    def test_published_document_language_follows_readable_script(self):
        from copy import deepcopy
        from supermega_runtime.website_public_page import render_website_inquiry_page
        from supermega_runtime.website_runtime import _website_artifact
        state = _state()
        page = state['pages'][0]
        state['siteName'] = 'မြန်မာဆိုင်'
        page['navigation']['label'] = 'ပင်မစာမျက်နှာ'
        page['hero'].update(eyebrow='ကျွန်ုပ်တို့၏ဆိုင်', headline='မြန်မာစီးပွားရေးအတွက် ဝန်ဆောင်မှု',
                            summary='လုပ်ငန်းတိုင်းအတွက် လွယ်ကူစွာ အသုံးပြုနိုင်သော ဝန်ဆောင်မှု။')
        page['seo'].update(title='မြန်မာဆိုင်', description='ကျွန်ုပ်တို့အကြောင်း သိရှိရန်။')
        page['sections'][0].update(eyebrow='ဝန်ဆောင်မှု', title='သင့်လုပ်ငန်းအတွက် အကူအညီ',
                                   body='သင့်လုပ်ငန်းကို ပိုမိုလွယ်ကူစွာ စီမံပါ။')
        record = {'channelId': str(uuid4()), 'pageId': 'page-home', 'artifact': _website_artifact(state)}
        burmese = render_website_inquiry_page(record).body.decode()
        self.assertIn('<html lang="my">', burmese)
        mixed = deepcopy(state)
        mixed['siteName'] = 'Synthetic Studio မြန်မာ'
        mixed['pages'][0]['hero'].update(eyebrow='Business website', headline='Run your business clearly',
                                         summary='Publish your services and meet your customers.')
        mixed['pages'][0]['seo'].update(title='Business website', description='Publish pages for your business.')
        mixed['pages'][0]['sections'][0].update(eyebrow='Services', title='How we help',
                                                body='Clear service pages for local customers.')
        self.assertIn('<html lang="en">', render_website_inquiry_page(
            {**record, 'artifact': _website_artifact(mixed)}).body.decode())

    def test_form_retry_reuses_identity_and_receipt_controls_success(self):
        from supermega_runtime.website_public_page import _SCRIPT
        # Execute the shipped browser script against controlled DOM/network
        # interfaces. This is a client behavior test, not hosted/browser proof.
        program = """
import assert from 'node:assert/strict';
function harness(responses){
  let submit; const requests=[]; const fields={disabled:false};
  const button={disabled:false,textContent:'Send message'}; const status={textContent:''};
  const form={action:'/api/public/sites/example/inquiries',reportValidity:()=>true,
    querySelector:name=>name==='fieldset'?fields:button,
    addEventListener:(name,handler)=>{submit=handler}};
  const document={querySelector:()=>form,getElementById:()=>status};
  const FormData=class{get(name){return {name:' Test ',contact:'test@example.test',message:' Hello ',consent:'on'}[name]}};
  const crypto={randomUUID:()=> '00000000-0000-4000-8000-000000000001'};
  const fetch=async(url,options)=>{requests.push(JSON.parse(options.body)); const response=responses.shift();
    if(response instanceof Error)throw response;
    return {ok:response===200,status:response,json:async()=>({status:'received',requestId:requests.at(-1).requestId})}};
  new Function('document','FormData','crypto','fetch',SCRIPT)(document,FormData,crypto,fetch);
  return {send:()=>submit({preventDefault(){}}),requests,fields,button,status};
}
const lost=harness([new Error('response lost'),200]); await lost.send();
assert.equal(lost.button.disabled,false); assert.equal(lost.fields.disabled,true);
assert.match(lost.status.textContent,/could not confirm/); await lost.send();
assert.deepEqual(lost.requests[0],lost.requests[1]); assert.equal(lost.requests[0].name,'Test');
assert.equal(lost.button.disabled,true); assert.match(lost.status.textContent,/has been received/);
const invalid=harness([422]); await invalid.send();
assert.equal(invalid.fields.disabled,false); assert.equal(invalid.button.disabled,false);
const offline=harness([503,503]); await offline.send(); await offline.send();
assert.deepEqual(offline.requests[0],offline.requests[1]); assert.doesNotMatch(offline.status.textContent,/has been received/);
const removed=harness([404]); await removed.send(); assert.equal(removed.button.disabled,true);
assert.match(removed.status.textContent,/no longer available/);
console.log('PASS: loss retry, durable receipt, validation recovery, storage failure and withdrawal');
"""
        result = subprocess.run(['node', '--input-type=module', '--eval', 'const SCRIPT=' + json.dumps(_SCRIPT) + ';\n' + program],
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_WEBSITE_INQUIRY_SQL') == '1', 'explicit disposable SQL rehearsal only')
class WebsiteInquirySqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import psycopg
        cls.db_error = psycopg.Error
        cls.bin = pg._default_postgres_bin()
        cls.environment = pg._clean_environment(cls.bin)
        cls.disposable = pg._disposable_workspace()
        cls.workspace, cls.cleanup = cls.disposable.__enter__()
        cls.data = cls.workspace / 'primary-data'
        cls.started = False
        cls.addClassCleanup(cls.stop)
        port, password, runtime_password = pg._free_loopback_port(), pg._password(), pg._password()
        pg._initialize_cluster(postgres_bin=cls.bin, openssl=pg._default_openssl(), data_directory=cls.data,
                               admin_password=password, port=port, environment=cls.environment)
        cls.started = True
        pg._start_cluster(postgres_bin=cls.bin, data_directory=cls.data, log_file=cls.workspace / 'postgres.log',
                          port=port, environment=cls.environment)
        root = pg._connection_url('postgres', password, port, 'postgres')
        cls.admin_url = pg._connection_url('postgres', password, port, pg.DATABASE_NAME)
        cls.runtime_url = pg._connection_url(pg.RUNTIME_ROLE, runtime_password, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(root, pg.DATABASE_NAME)
        pg._create_auth_session_fixture(cls.admin_url)
        pg._apply_migrations(postgres_bin=cls.bin, admin_password=password, admin_database_url=cls.admin_url,
                             port=port, environment=cls.environment, migrations=pg.CURRENT_MIGRATIONS)
        pg._provision_runtime(cls.admin_url, runtime_password)
        pg._seed_rehearsal_data(cls.admin_url)
        with pg._connect(cls.admin_url, autocommit=True) as connection:
            connection.execute("insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by) values (%s,'website',1,%s::jsonb,%s)",
                               (WORKSPACE, json.dumps(_state()), OWNER.actor_id))

    @classmethod
    def stop(cls):
        stopped = not cls.started or pg._stop_cluster(postgres_bin=cls.bin, data_directory=cls.data, environment=cls.environment)
        cls.cleanup['stopped'] = stopped
        cls.disposable.__exit__(None, None, None)
        if not stopped:
            raise RuntimeError('website_inquiry_sql_cleanup_incomplete')

    def setUp(self):
        with pg._connect(self.admin_url) as connection:
            connection.execute('delete from app_private.website_inbox')
            connection.execute('delete from app_private.website_inquiry_channels')
            # Reset this test-owned synthetic row without weakening version guards.
            connection.execute("delete from app_private.workspace_state where workspace_id=%s and surface='website'", (WORKSPACE,))
            connection.execute("insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by) values(%s,'website',1,%s::jsonb,%s)",
                               (WORKSPACE, json.dumps(_published_state()), OWNER.actor_id))
        self.adapter = WebsiteInquiryStore(PostgresTrialStore(self.runtime_url, reducer=lambda *args: {}, write_enabled=True))
        self.origins = {}

    def channel(self, *, enabled=True, origin=ORIGIN, page_id='page-home', expected_version=1):
        channel = str(uuid4())
        self.origins[channel] = origin
        result = self.adapter.prepare_channel(OWNER, channel_id=channel, page_id=page_id, expected_version=expected_version, origin=origin)
        self.assertEqual(result, {'channelId': channel, 'enabled': False})
        if enabled:
            self.adapter.publish_channel(OWNER, channel_id=channel, expected_version=expected_version, public_origin=origin)
        return channel

    def receive(self, channel, request=None, key='client', **overrides):
        arguments = dict(channel_id=channel, request_id=request or str(uuid4()), origin=self.origins.get(channel, ORIGIN),
                         payload=BODY, client_key=sha256(key.encode()).hexdigest())
        arguments.update(overrides)
        return self.adapter.receive(**arguments)

    def test_prepare_is_disabled_idempotent_and_does_not_activate_or_publish(self):
        channel = self.channel(enabled=False)
        self.assertEqual(self.adapter.prepare_channel(OWNER, channel_id=channel, page_id='page-home', expected_version=1, origin=ORIGIN),
                         {'channelId': channel, 'enabled': False})
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_unavailable'):
            self.receive(channel)
        with self.assertRaisesRegex(TrialValidationError, 'source_stale'):
            self.adapter.prepare_channel(OWNER, channel_id=str(uuid4()), page_id='page-home', expected_version=2, origin=ORIGIN)
        with self.assertRaisesRegex(TrialValidationError, 'channel_conflict'):
            self.adapter.prepare_channel(OWNER, channel_id=channel, page_id='page-home', expected_version=1, origin='https://other.example')

    def test_committed_delivery_replay_and_private_burmese_inbox(self):
        channel, request = self.channel(), str(uuid4())
        receipt = self.receive(channel, request)
        self.assertEqual(receipt, {'status': 'received', 'requestId': request, 'duplicate': False})
        self.assertTrue(self.receive(channel, request)['duplicate'])
        inbox = self.adapter.inbox(OWNER)
        self.assertEqual(len(inbox['inquiries']), 1)
        self.assertEqual(inbox['inquiries'][0]['message'], BODY['message'])
        self.assertEqual(inbox['inquiries'][0]['sourcePage'], '/')
        self.assertNotIn('client_key', json.dumps(inbox))
        for value in (BODY['name'], BODY['contact'], BODY['message'], WORKSPACE):
            self.assertNotIn(value, json.dumps(receipt, ensure_ascii=False))

    def test_retry_cannot_rewrite_customer_evidence(self):
        channel, request = self.channel(), str(uuid4())
        self.receive(channel, request)
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_retry_conflict'):
            self.receive(channel, request, payload={**BODY, 'message': 'changed'})
        self.assertEqual(self.adapter.inbox(OWNER)['inquiries'][0]['message'], BODY['message'])

    def test_disabled_wrong_origin_unknown_and_suspended_workspace_reject_before_replay(self):
        channel, request = self.channel(), str(uuid4())
        self.receive(channel, request)
        for arguments in ({'origin': 'https://wrong.example'}, {'channel_id': str(uuid4())}):
            with self.assertRaisesRegex(self.db_error, 'website_inquiry_unavailable'):
                self.receive(channel, request, **arguments)
        with pg._connect(self.admin_url) as connection:
            connection.execute('update app_private.website_inquiry_channels set enabled=false where channel_id=%s', (channel,))
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_unavailable'):
            self.receive(channel, request)
        # Suspension is terminal in the real schema. Exercise it in a transaction
        # that rolls back on denial, rather than weakening the guard to reset it.
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_unavailable'), pg._connect(self.admin_url) as connection:
            connection.execute('update app_private.website_inquiry_channels set enabled=true where channel_id=%s', (channel,))
            connection.execute("update app_private.workspace_access_controls set status='suspended' where workspace_id=%s", (WORKSPACE,))
            connection.execute('select app_private.receive_website_inquiry(%s,%s,%s,%s,%s,%s,true,%s)',
                               (channel, request, ORIGIN, BODY['name'], BODY['contact'], BODY['message'], 'a' * 64))

    def test_concurrent_duplicate_submissions_commit_once(self):
        channel, request = self.channel(), str(uuid4())
        with ThreadPoolExecutor(max_workers=4) as pool:
            receipts = list(pool.map(lambda _: self.receive(channel, request), range(4)))
        self.assertEqual(sum(not receipt['duplicate'] for receipt in receipts), 1)
        self.assertEqual(len(self.adapter.inbox(OWNER)['inquiries']), 1)

    def test_durable_client_budget_shared_between_channels_and_replay_does_not_spend(self):
        first, second = self.channel(), self.channel(origin='https://second.example')
        request = str(uuid4())
        self.receive(first, request)
        for index in range(5):
            self.receive(first if index % 2 else second)
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_capacity'):
            self.receive(second)
        self.assertTrue(self.receive(first, request)['duplicate'])
        self.assertEqual(len(self.adapter.inbox(OWNER)['inquiries']), 6)

    def test_concurrent_channels_cannot_race_the_shared_budget(self):
        channels = [self.channel(), self.channel(origin='https://second.example')]
        def submit(index):
            try:
                self.receive(channels[index % 2])
                return 'received'
            except self.db_error as error:
                self.assertIn('website_inquiry_capacity', str(error))
                return 'limited'
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(submit, range(8)))
        self.assertEqual(results.count('received'), 6)
        self.assertEqual(results.count('limited'), 2)

    def test_inbox_pagination_stays_stable_with_new_arrival(self):
        channel = self.channel()
        for index in range(52):
            self.receive(channel, key=f'client-{index}')
        first = self.adapter.inbox(OWNER)
        self.assertEqual(len(first['inquiries']), 50)
        self.receive(channel, key='late-arrival')
        second = self.adapter.inbox(OWNER, before=tuple(first['nextBefore']))
        self.assertEqual(len(second['inquiries']), 2)
        self.assertIsNone(second['nextBefore'])
        self.assertEqual(len({row['requestId'] for row in first['inquiries'] + second['inquiries']}), 52)

    def test_browser_roles_and_cross_workspace_cannot_read_or_write(self):
        channel = self.channel()
        self.receive(channel)
        with pg._connect(self.admin_url) as connection:
            for role in ('anon', 'authenticated', 'service_role'):
                row = connection.execute("""select has_table_privilege(%s,'app_private.website_inbox','select'),
                    has_function_privilege(%s,'app_private.receive_website_inquiry(uuid,uuid,text,text,text,text,boolean,text)','execute')""", (role, role)).fetchone()
                self.assertEqual(row, (False, False))
        with self.assertRaises((TrialPermissionDenied, TrialNotReadyError)):
            self.adapter.inbox(TrialPrincipal('rehearsal-b', 'owner-b', 'human'))
        with pg._connect(self.runtime_url) as connection:
            connection.execute("select set_config('app.workspace_id','rehearsal-b',true), set_config('app.actor_id','owner-b',true), set_config('app.actor_kind','human',true)")
            self.assertEqual(connection.execute('select count(*) from app_private.website_inbox').fetchone()[0], 0)
        with self.assertRaises(self.db_error), pg._connect(self.runtime_url) as connection:
            connection.execute('update app_private.website_inquiry_channels set enabled=true')

    def test_invalid_payload_write_gate_and_no_consent_leave_no_record(self):
        channel = self.channel()
        for body in ({**BODY, 'consent': False}, {**BODY, 'workspaceId': 'other'}, {**BODY, 'name': 'x' * 81}):
            with self.assertRaises(TrialValidationError):
                self.receive(channel, payload=body)
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_invalid'):
            self.receive(channel, client_key='browser-value')
        self.adapter.store.write_enabled = False
        with self.assertRaises(TrialNotReadyError):
            self.receive(channel)
        self.assertEqual(self.adapter.inbox(OWNER)['inquiries'], [])

    def client(self, *, enabled=True, address='192.0.2.1', principal=OWNER, public_origin=ORIGIN):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from supermega_runtime.website_inquiry_api import create_website_inquiry_router
        app = FastAPI()
        app.include_router(create_website_inquiry_router(store=self.adapter, enabled=enabled,
            resolve_client_address=lambda request: address, resolve_principal=lambda request: principal,
            abuse_key=bytes(range(32)), public_origin=public_origin))
        return TestClient(app)

    def test_approved_page_publish_form_delivery_and_unpublish(self):
        channel = self.channel(enabled=False)
        client = self.client()
        self.assertEqual(client.get(f'/sites/{channel}').status_code, 404)
        publish = client.post(f'/api/trial/v1/website-inquiry-channels/{channel}/publish', json={'expectedVersion': 1})
        self.assertEqual(publish.status_code, 200, publish.text)
        self.assertTrue(publish.json()['enabled'])
        page = client.get(f'/sites/{channel}')
        self.assertEqual(page.status_code, 200)
        self.assertIn('Run the website with evidence.', page.text)
        self.assertIn(f'action="/api/public/sites/{channel}/inquiries"', page.text)
        self.assertIn('name="consent"', page.text)
        self.assertIn("connect-src 'self'", page.headers['content-security-policy'])
        self.assertNotIn('unsafe-inline', page.headers['content-security-policy'])
        self.assertNotIn(WORKSPACE, page.text)
        self.assertNotIn('owner-product', page.text)
        request = str(uuid4())
        sent = client.post(f'/api/public/sites/{channel}/inquiries', json={**BODY, 'requestId': request}, headers={'Origin': ORIGIN})
        self.assertEqual(sent.status_code, 200)
        self.assertEqual(client.get('/api/trial/v1/website-inbox').json()['inquiries'][0]['requestId'], request)
        self.assertNotIn(BODY['contact'], client.get(f'/sites/{channel}').text)
        withdrawn = client.post(f'/api/trial/v1/website-inquiry-channels/{channel}/unpublish', json={'artifactDigest': publish.json()['artifactDigest']})
        self.assertEqual(withdrawn.status_code, 200)
        self.assertEqual(client.get(f'/sites/{channel}').status_code, 404)
        self.assertEqual(client.post(f'/api/public/sites/{channel}/inquiries', json={**BODY, 'requestId': request}, headers={'Origin': ORIGIN}).status_code, 404)
        self.assertEqual(client.post(f'/api/trial/v1/website-inquiry-channels/{channel}/publish', json={'expectedVersion': 1}).status_code, 409)
        self.assertEqual(len(self.adapter.inbox(OWNER)['inquiries']), 1)

    def test_publication_is_immutable_when_a_new_draft_is_saved(self):
        channel = self.channel()
        published = self.adapter.public_page(channel_id=channel, public_origin=ORIGIN)
        with pg._connect(self.admin_url) as connection:
            draft = _state()
            draft['pages'][0]['hero']['headline'] = 'PRIVATE UNAPPROVED DRAFT'
            connection.execute("update app_private.workspace_state set version=2,state_json=%s::jsonb where workspace_id=%s and surface='website'",
                               (json.dumps(draft), WORKSPACE))
        self.assertEqual(self.adapter.public_page(channel_id=channel, public_origin=ORIGIN), published)
        retry = self.adapter.publish_channel(OWNER, channel_id=channel, expected_version=1, public_origin=ORIGIN)
        self.assertEqual(retry['artifactDigest'], published['artifactDigest'])
        with self.assertRaisesRegex(self.db_error, 'source_stale'):
            self.adapter.publish_channel(OWNER, channel_id=channel, expected_version=2, public_origin=ORIGIN)
        unapproved = str(uuid4())
        self.adapter.prepare_channel(OWNER, channel_id=unapproved, page_id='page-home', expected_version=2, origin=ORIGIN)
        with self.assertRaises(TrialValidationError):
            self.adapter.publish_channel(OWNER, channel_id=unapproved, expected_version=2, public_origin=ORIGIN)
        self.assertIsNone(self.adapter.public_page(channel_id=unapproved, public_origin=ORIGIN))

    def test_multipage_navigation_keeps_inquiry_attribution_and_withdraws_all_pages(self):
        with pg._connect(self.admin_url) as connection:
            connection.execute("update app_private.workspace_state set version=2,state_json=%s::jsonb where workspace_id=%s and surface='website'",
                               (json.dumps(_published_state(_multipage_state())), WORKSPACE))
        channel = self.channel(page_id='page-contact', expected_version=2)
        client = self.client()
        base = f'/sites/{channel}'
        for path, title in (('', 'Home'), ('/', 'Home'), ('/services', 'Services'), ('/services/', 'Services'), ('/contact', 'Contact')):
            response = client.get(base + path)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn(f'<title>{title} | Synthetic Studio</title>', response.text)
            self.assertNotIn('Private draft', response.text)
            self.assertEqual('<form' in response.text, title == 'Contact')
            self.assertIn('no-store', response.headers['cache-control'])
        for path in ('/private-draft', '/missing', '/services/extra'):
            self.assertEqual(client.get(base + path).status_code, 404)
        self.assertEqual(client.get(base + '?page_path=contact').status_code, 422)
        self.assertEqual(self.client(public_origin='https://other.example').get(base + '/contact').status_code, 404)
        body = {**BODY, 'requestId': str(uuid4())}
        self.assertEqual(client.post(f'/api/public/sites/{channel}/inquiries', json={**body, 'pageId': 'page-home'},
                                    headers={'Origin': ORIGIN}).status_code, 422)
        self.assertEqual(client.post(f'/api/public/sites/{channel}/inquiries', json=body, headers={'Origin': ORIGIN}).status_code, 200)
        inquiry = self.adapter.inbox(OWNER)['inquiries'][0]
        self.assertEqual(inquiry['sourcePage'], '/contact')
        self.assertEqual(inquiry['message'], BODY['message'])
        published = self.adapter.public_page(channel_id=channel, public_origin=ORIGIN)
        self.adapter.unpublish_channel(OWNER, channel_id=channel, artifact_digest=published['artifactDigest'])
        for path in ('', '/', '/services', '/contact'):
            self.assertEqual(client.get(base + path).status_code, 404)
        self.assertEqual(self.adapter.inbox(OWNER)['inquiries'][0], inquiry)

    def test_publication_requires_exact_origin_current_source_and_human_access(self):
        channel = self.channel(enabled=False)
        route = f'/api/trial/v1/website-inquiry-channels/{channel}/publish'
        self.assertEqual(self.client(principal=None).post(route, json={'expectedVersion': 1}).status_code, 401)
        self.assertEqual(self.client(principal=TrialPrincipal('rehearsal-b','owner-b','human')).post(route, json={'expectedVersion': 1}).status_code, 403)
        self.assertEqual(self.client(public_origin='').post(route, json={'expectedVersion': 1}).status_code, 503)
        self.assertEqual(self.client(public_origin='https://other.example').post(route, json={'expectedVersion': 1}).status_code, 409)
        self.assertEqual(self.client().post(route, json={'expectedVersion': 1, 'artifact': {}}).status_code, 422)
        with pg._connect(self.admin_url) as connection:
            connection.execute("update app_private.workspace_state set version=2 where workspace_id=%s and surface='website'", (WORKSPACE,))
        with self.assertRaisesRegex(TrialValidationError, 'source_stale'):
            self.adapter.publish_channel(OWNER, channel_id=channel, expected_version=1, public_origin=ORIGIN)
        self.assertIsNone(self.adapter.public_page(channel_id=channel, public_origin=ORIGIN))

    def test_replacement_retires_previous_form_and_retains_its_inquiries(self):
        previous = self.channel()
        self.receive(previous)
        replacement = self.channel()
        self.assertIsNone(self.adapter.public_page(channel_id=previous, public_origin=ORIGIN))
        self.assertIsNotNone(self.adapter.public_page(channel_id=replacement, public_origin=ORIGIN))
        with self.assertRaisesRegex(self.db_error, 'website_inquiry_unavailable'):
            self.receive(previous)
        self.assertEqual(len(self.adapter.inbox(OWNER)['inquiries']), 1)

    def test_concurrent_publications_leave_one_active_page(self):
        channels = [self.channel(enabled=False), self.channel(enabled=False)]
        with ThreadPoolExecutor(max_workers=2) as pool:
            receipts = list(pool.map(lambda channel: self.adapter.publish_channel(OWNER,
                channel_id=channel, expected_version=1, public_origin=ORIGIN), channels))
        self.assertTrue(all(receipt['enabled'] for receipt in receipts))
        self.assertEqual(sum(self.adapter.public_page(channel_id=channel, public_origin=ORIGIN) is not None
                             for channel in channels), 1)

    def test_sql_publication_rejects_forged_artifact_and_revoked_publisher(self):
        channel = self.channel(enabled=False)
        with self.assertRaisesRegex(self.db_error, 'approval_required'), pg._connect(self.runtime_url) as connection:
            connection.execute("select set_config('app.workspace_id',%s,true),set_config('app.actor_id',%s,true),set_config('app.actor_kind','human',true)", (WORKSPACE, OWNER.actor_id))
            connection.execute('select app_private.publish_website_inquiry_channel(%s,1,%s,%s,%s)',
                               (channel, 'snapshot-managed-release', 'sha256:' + '0' * 64, ORIGIN))
        # Roll back the synthetic revocation together with its denied action.
        with self.assertRaisesRegex(self.db_error, 'access_denied'), pg._connect(self.admin_url) as connection:
            connection.execute("select set_config('app.workspace_id',%s,true),set_config('app.actor_id',%s,true),set_config('app.actor_kind','human',true)", (WORKSPACE, OWNER.actor_id))
            connection.execute("update app_private.workspace_memberships set status='revoked' where workspace_id=%s and actor_id=%s", (WORKSPACE, OWNER.actor_id))
            connection.execute('select app_private.publish_website_inquiry_channel(%s,1,%s,%s,%s)',
                               (channel, 'snapshot-managed-release', 'sha256:' + '0' * 64, ORIGIN))
        with pg._connect(self.admin_url) as connection:
            for role in ('anon', 'authenticated', 'service_role'):
                for signature in ('publish_website_inquiry_channel(uuid,bigint,text,text,text)',
                                  'unpublish_website_inquiry_channel(uuid,text)', 'read_website_inquiry_page(uuid,text)'):
                    self.assertFalse(connection.execute('select has_function_privilege(%s,%s,%s)',
                        (role, 'app_private.' + signature, 'execute')).fetchone()[0])
        self.assertIsNone(self.adapter.public_page(channel_id=channel, public_origin=ORIGIN))

    def test_public_renderer_escapes_customer_authored_content(self):
        from supermega_runtime.website_public_page import render_website_inquiry_page
        channel = self.channel()
        page = self.adapter.public_page(channel_id=channel, public_origin=ORIGIN)
        page['artifact']['pages'][0]['hero']['headline'] = '<script>alert("unsafe")</script>'
        html = render_website_inquiry_page(page).body.decode()
        self.assertIn('&lt;script&gt;', html)
        self.assertNotIn('<script>alert', html)

    def test_http_to_database_to_operator_inbox(self):
        channel = self.channel()
        client = self.client()
        body = {**BODY, 'requestId': str(uuid4())}
        response = client.post(f'/api/public/sites/{channel}/inquiries', json=body, headers={'Origin': ORIGIN})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'received', 'requestId': body['requestId'], 'duplicate': False})
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        inbox = client.get('/api/trial/v1/website-inbox')
        self.assertEqual(inbox.status_code, 200)
        self.assertEqual(inbox.json()['inquiries'][0]['message'], BODY['message'])
        anonymous = self.client(principal=None)
        self.assertEqual(anonymous.get('/api/trial/v1/website-inbox').status_code, 401)
        self.assertEqual(client.get('/api/trial/v1/website-inbox?workspace=other').status_code, 422)

    def test_http_bounds_disabled_mode_and_spoofed_rate_key(self):
        channel = self.channel()
        route = f'/api/public/sites/{channel}/inquiries'
        body = {**BODY, 'requestId': str(uuid4())}
        client = self.client()
        self.assertEqual(self.client(enabled=False).post(route, json=body, headers={'Origin': ORIGIN}).status_code, 503)
        self.assertEqual(self.client(address='untrusted').post(route, json=body, headers={'Origin': ORIGIN}).status_code, 503)
        self.assertEqual(client.post(route, json=body).status_code, 422)
        self.assertEqual(client.post(route, content='x' * 4097, headers={'Origin': ORIGIN, 'Content-Type': 'application/json'}).status_code, 413)
        self.assertEqual(client.post(route, content='{"name":"a","name":"b"}', headers={'Origin': ORIGIN, 'Content-Type': 'application/json'}).status_code, 422)
        self.assertEqual(client.post(route, json={**body, 'client_key': 'attacker'}, headers={'Origin': ORIGIN}).status_code, 422)
        for index in range(6):
            response = client.post(route, json={**body, 'requestId': str(uuid4())},
                headers={'Origin': ORIGIN, 'X-Forwarded-For': f'192.0.2.{index + 10}'})
            self.assertEqual(response.status_code, 200)
        response = client.post(route, json=body, headers={'Origin': ORIGIN, 'X-Forwarded-For': '198.51.100.1'})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json(), {'detail': 'try_later'})
        self.assertNotIn(BODY['contact'], response.text)
        # IPv4-mapped IPv6 is the same caller and cannot obtain a fresh budget.
        mapped = self.client(address='::ffff:192.0.2.1')
        self.assertEqual(mapped.post(route, json=body, headers={'Origin': ORIGIN}).status_code, 429)

    def test_http_storage_failure_never_acknowledges_or_exposes_error_detail(self):
        from unittest.mock import patch
        channel = self.channel()
        with patch.object(self.adapter, 'receive', side_effect=RuntimeError('PRIVATE_CUSTOMER_TEXT')):
            response = self.client().post(f'/api/public/sites/{channel}/inquiries',
                json={**BODY, 'requestId': str(uuid4())}, headers={'Origin': ORIGIN})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {'detail': 'website_inquiries_unavailable'})
        self.assertNotIn('PRIVATE_CUSTOMER_TEXT', response.text)
        self.assertEqual(self.adapter.inbox(OWNER)['inquiries'], [])


if __name__ == '__main__':
    unittest.main()
