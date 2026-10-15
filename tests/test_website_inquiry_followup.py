"""Real local PostgreSQL follow-up lifecycle; synthetic customers, no sends."""
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from unittest.mock import patch

from supermega_runtime.trial_store import TrialPermissionDenied, TrialNotReadyError, TrialValidationError
from supermega_runtime.website_inquiry_store import WebsiteInquiryStore
from tests.test_website_media_postgres import LocalWebsiteDatabaseCase
from tests import test_website_published_media as publication


class InquiryFollowupTests(LocalWebsiteDatabaseCase):
    _channel = publication.PublishedMediaPostgresTests._channel
    _publish = publication.PublishedMediaPostgresTests._publish
    _client = publication.PublishedMediaPostgresTests._client
    _withdraw = publication.PublishedMediaPostgresTests._withdraw

    def setUp(self):
        super().setUp()
        self.adapter = WebsiteInquiryStore(self.store, media_storage=self.storage)
        self.channel = self._channel()
        self.request = str(uuid4())
        self.adapter.receive(channel_id=self.channel, request_id=self.request, origin=publication.ORIGIN,
            payload={'name': 'QA customer', 'contact': 'qa@example.test', 'message': 'Synthetic request', 'consent': True},
            client_key='a'*64)

    def change(self, operation='claim', revision=1, *, actor=None, action=None, note=''):
        return self.adapter.change_inquiry(actor or self.owner, channel_id=self.channel, request_id=self.request,
            action_id=action or str(uuid4()), expected_revision=revision, operation=operation, note=note)

    def test_claim_note_complete_reopen_persist_and_keep_audit_without_customer_text(self):
        self.assertEqual(self.change()['status'], 'in_progress')
        self.change('note', 2, note='ဖုန်းပြန်ဆက်ရန်။')
        self.change('complete', 3)
        inbox = WebsiteInquiryStore(self.store).inbox(self.owner)
        self.assertEqual(inbox['inquiries'], [])
        self.assertEqual(inbox['counts'], {'open': 0, 'done': 1})
        done = self.adapter.inbox(self.owner, view='done')['inquiries'][0]
        self.assertEqual((done['status'], done['revision'], done['assignedTo'], done['note']),
                         ('done', 4, self.owner.actor_id, 'ဖုန်းပြန်ဆက်ရန်။'))
        self.change('reopen', 4)
        current = self.adapter.inbox(self.owner)['inquiries'][0]
        self.assertEqual((current['status'], current['revision'], current['assignedTo']), ('new', 5, None))
        rows = self._sql('select operation,receipt,note_digest from app_private.website_inquiry_actions where workspace_id=%s order by created_at', (self.owner.workspace_id,))
        self.assertEqual([r[0] for r in rows], ['claim','note','complete','reopen'])
        self.assertNotIn('qa@example.test', str(rows))
        self.assertNotIn('ဖုန်းပြန်ဆက်ရန်။', str(rows))

    def test_same_action_retries_once_and_changed_retry_is_rejected(self):
        action = str(uuid4())
        first = self.change(action=action)
        self.assertEqual(self.change(action=action), first)
        with self.assertRaises(Exception) as caught:
            self.change('complete', 2, action=action)
        self.assertEqual(caught.exception.diag.message_primary, 'website_inquiry_retry_conflict')
        self.assertEqual(self.adapter.inbox(self.owner)['inquiries'][0]['revision'], 2)

    def test_two_teammates_racing_to_claim_have_one_winner(self):
        other = self._principal(self.owner.workspace_id)
        def claim(actor):
            try:
                return self.change(actor=actor)['assignedTo']
            except Exception as exc:
                return exc.diag.message_primary
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(claim, (self.owner, other)))
        self.assertEqual(results.count('website_inquiry_changed'), 1)
        self.assertEqual(self._sql('select count(*) from app_private.website_inquiry_actions where workspace_id=%s', (self.owner.workspace_id,))[0][0], 1)

    def test_stale_note_cannot_overwrite_newer_work(self):
        self.change('note', note='First saved note')
        with self.assertRaises(Exception) as caught:
            self.change('note', note='Stale draft')
        self.assertEqual(caught.exception.diag.message_primary, 'website_inquiry_changed')
        self.assertEqual(self.adapter.inbox(self.owner)['inquiries'][0]['note'], 'First saved note')

    def test_assignment_release_and_other_teammate_completion_guard(self):
        other = self._principal(self.owner.workspace_id)
        self.change()
        for operation in ('release','complete'):
            with self.assertRaises(Exception) as caught:
                self.change(operation, 2, actor=other)
            self.assertEqual(caught.exception.diag.message_primary, 'website_inquiry_changed')
        self.change('release', 2)
        self.assertEqual(self.change('claim', 3, actor=other)['assignedTo'], other.actor_id)

    def test_cross_workspace_viewer_and_revoked_membership_cannot_write(self):
        with self.assertRaises(Exception) as caught:
            self.change(actor=self._principal())
        self.assertEqual(caught.exception.diag.message_primary, 'website_inquiry_not_found')
        with self.assertRaises(TrialPermissionDenied):
            self.change(actor=self._principal(self.owner.workspace_id, viewer=True))
        self._sql("update app_private.workspace_memberships set status='revoked' where workspace_id=%s and actor_id=%s", (self.owner.workspace_id,self.owner.actor_id))
        with self.assertRaises(TrialNotReadyError):
            self.change()

    def test_audit_catalog_drift_closes_followup_without_state_changes(self):
        self._sql('grant insert on app_private.website_inquiry_actions to supermega_trial_backend')
        try:
            with self.assertRaises(TrialNotReadyError): self.change()
        finally:
            self._sql('revoke insert on app_private.website_inquiry_actions from supermega_trial_backend')
        self.assertEqual(self.adapter.inbox(self.owner)['inquiries'][0]['revision'], 1)

    def test_no_browser_role_or_runtime_direct_write(self):
        for role in ('anon','authenticated','service_role','supermega_trial_backend'):
            self.assertFalse(self._sql("select has_table_privilege(%s,'app_private.website_inbox','UPDATE')", (role,))[0][0])
            self.assertFalse(self._sql("select has_table_privilege(%s,'app_private.website_inquiry_actions','INSERT')", (role,))[0][0])
        for role in ('anon','authenticated','service_role'):
            self.assertFalse(self._sql("select has_function_privilege(%s,'app_private.change_website_inquiry(uuid,uuid,uuid,bigint,text,text)','EXECUTE')", (role,))[0][0])

    def test_invalid_mutations_and_disabled_writes_fail_closed(self):
        for operation, revision, note in [('unknown',1,''),('claim',True,''),('note',1,'x'*801),('claim',1,'unexpected')]:
            with self.assertRaises(TrialValidationError): self.change(operation,revision,note=note)
        with patch.object(self.store,'write_enabled',False), self.assertRaises(TrialNotReadyError): self.change()

    def test_http_contract_filters_and_conflict_are_safe(self):
        with self._client() as client:
            path=f'/api/trial/v1/website-inbox/{self.channel}/{self.request}/actions'
            body={'actionId':str(uuid4()),'expectedRevision':1,'operation':'complete','note':''}
            response=client.post(path,json=body)
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.headers['cache-control'],'private, no-store')
            self.assertEqual(client.get('/api/trial/v1/website-inbox?view=done').json()['counts'],{'open':0,'done':1})
            self.assertEqual(client.get('/api/trial/v1/website-inbox').json()['inquiries'],[])
            stale=client.post(path,json={**body,'actionId':str(uuid4())})
            self.assertEqual(stale.status_code,409)
            self.assertEqual(stale.json(),{'detail':'inquiry_changed'})
            self.assertEqual(client.post(path,json={**body,'workspaceId':'other'}).status_code,422)
            for query in ('view=unknown','view=open&view=done','beforeTime=bad','workspace=other'):
                self.assertEqual(client.get('/api/trial/v1/website-inbox?'+query).status_code,422)
        self._withdraw(self.channel)
        self.assertEqual(self.adapter.inbox(self.owner,view='done')['counts']['done'],1)
