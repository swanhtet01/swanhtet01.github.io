"""Synthetic private catalog domain tests; no provider access."""
import hashlib
from pathlib import Path
import re
import unittest
from contextlib import contextmanager
from unittest.mock import Mock, patch
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from supermega_runtime.ecommerce_customer_review import prepare_catalog_review, catalog_review_projection, build_catalog_acceptance, build_catalog_change_request
from supermega_runtime.ecommerce_customer_review_store import EcommerceCustomerReviewStore, FUNCTIONS
from supermega_runtime.trial_store import TrialPermissionDenied, TrialPrincipal, TrialReadiness, TrialValidationError, _ECOMMERCE_REVIEW_TRIGGERS
from tests.test_commerce_runtime import catalog_state, storefront_configuration


class CatalogReviewManagementBoundaryTests(unittest.TestCase):
    def test_runtime_function_pins_match_the_authoritative_migration(self):
        migration = Path(__file__).resolve().parents[1] / "supabase/migrations/20261019070000_ecommerce_operator_management_boundary.sql"
        source = migration.read_text(encoding="utf-8")
        for name in ("ecommerce_review_operator_entitled", "ecommerce_review_recipient_ready"):
            with self.subTest(function=name):
                match = re.search(
                    rf"create or replace function app_private\.{name}\([^)]*\).*?as \$\$(.*?)\$\$;",
                    source, re.IGNORECASE | re.DOTALL)
                self.assertIsNotNone(match)
                digest = hashlib.sha256(match.group(1).replace("\r\n", "\n").strip().encode()).hexdigest()
                self.assertEqual(FUNCTIONS[name][-1], digest)

    def test_runtime_review_trigger_pin_matches_shared_lock_migration(self):
        migration = Path(__file__).resolve().parents[1] / "supabase/migrations/20261019103000_ecommerce_review_shared_state_lock.sql"
        source = migration.read_text(encoding="utf-8")
        match = re.search(
            r"create or replace function app_private\.guard_ecommerce_review\(\).*?as \$\$(.*?)\$\$;",
            source, re.IGNORECASE | re.DOTALL)
        self.assertIsNotNone(match)
        body = match.group(1).replace("\r\n", "\n").strip()
        digest = hashlib.sha256(body.encode()).hexdigest()
        self.assertEqual(_ECOMMERCE_REVIEW_TRIGGERS[("ecommerce_customer_reviews", "ecommerce_review_guard")][-1], digest)
        self.assertIn("new.workspace_id::text || ':state:commerce'", body)
        self.assertNotRegex(body, r"\bfor\s+update\b")

    def test_internal_operator_can_read_approved_reviewer_choices_without_shop_write(self):
        principal = TrialPrincipal('internal-workspace', 'ecommerce-operator', 'human')
        cursor = Mock()
        adapter = EcommerceCustomerReviewStore(Mock())

        @contextmanager
        def transaction(*args, **kwargs):
            self.assertEqual(args, (principal,))
            self.assertEqual(kwargs, {'write': False, 'capability': 'ecommerce.manage'})
            yield cursor, principal.normalized()

        with patch.object(adapter, '_transaction', side_effect=transaction), \
                patch.object(adapter, '_enrolled_recipients', return_value=[]) as enrolled:
            result = adapter.list_recipients(principal)

        self.assertEqual(result, {'recipients': [], 'nextAfter': None,
                                  'order': 'grant_id_ascending', 'accessGranted': False})
        enrolled.assert_called_once_with(cursor, principal.normalized(), after=None)

    def test_shop_operator_cannot_prepare_internal_ecommerce_review(self):
        principal = TrialPrincipal('internal-workspace', 'shop-operator', 'human')
        cursor = Mock()
        store = Mock()

        @contextmanager
        def guarded_cursor(*_args, **_kwargs):
            yield cursor, frozenset({'commerce.write'})

        store._guarded_cursor.side_effect = guarded_cursor
        store._product_entitlements.return_value = ('commerce', 'ecommerce')
        adapter = EcommerceCustomerReviewStore(store)
        with patch('supermega_runtime.ecommerce_customer_review_store._assert_storage') as storage:
            with self.assertRaises(TrialPermissionDenied) as denied:
                adapter.preparation_preview(principal)
        self.assertEqual(denied.exception.required_capability, 'ecommerce.manage')
        storage.assert_not_called()
        cursor.execute.assert_not_called()

    def test_explicit_internal_grant_can_enter_the_review_transaction(self):
        principal = TrialPrincipal('internal-workspace', 'ecommerce-operator', 'human')
        cursor = Mock()
        cursor.fetchone.return_value = {'isolation': 'read committed'}
        store = Mock()

        @contextmanager
        def guarded_cursor(*_args, **_kwargs):
            yield cursor, frozenset({'commerce.read', 'ecommerce.manage'})

        store._guarded_cursor.side_effect = guarded_cursor
        store._product_entitlements.return_value = ('commerce', 'ecommerce')
        store._load_membership.return_value = frozenset({'commerce.read', 'ecommerce.manage'})
        adapter = EcommerceCustomerReviewStore(store)
        with patch('supermega_runtime.ecommerce_customer_review_store._assert_storage'):
            with adapter._transaction(principal, capability='ecommerce.manage') as (_, actor):
                self.assertEqual(actor, principal)

    def test_revoked_management_grant_is_denied_after_review_lock(self):
        principal = TrialPrincipal('internal-workspace', 'ecommerce-operator', 'human')
        cursor = Mock()
        cursor.fetchone.return_value = {'isolation': 'read committed'}
        store = Mock()

        @contextmanager
        def guarded_cursor(*_args, **_kwargs):
            # The grant was valid before the transaction contested the lock.
            yield cursor, frozenset({'commerce.read', 'ecommerce.manage'})

        store._guarded_cursor.side_effect = guarded_cursor
        store._product_entitlements.return_value = ('commerce', 'ecommerce')
        store._load_membership.return_value = frozenset({'commerce.read'})
        adapter = EcommerceCustomerReviewStore(store)
        with patch('supermega_runtime.ecommerce_customer_review_store._assert_storage'):
            with self.assertRaises(TrialPermissionDenied) as denied:
                with adapter._transaction(principal, capability='ecommerce.manage'):
                    self.fail('A revoked Ecommerce operator entered the review transaction.')
        self.assertEqual(denied.exception.required_capability, 'ecommerce.manage')
        store._load_membership.assert_called_once_with(cursor, principal)

class CatalogReviewTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026,9,25,tzinfo=timezone.utc)
        self.actor = TrialPrincipal('company', '22222222-2222-4222-8222-222222222222', actor_kind='human')
        self.ready = TrialReadiness(backend='synthetic',database_ready=True,role_ready=True,schema_ready=True,auth_ready=True,membership_ready=True,audit_ready=True,write_enabled=True,capabilities=frozenset({'ecommerce.review'}),product_entitlements=('ecommerce',))
        self.state = catalog_state(); self.state['storefrontConfiguration'] = storefront_configuration(self.state)
        self.review = prepare_catalog_review(self.state,principal=self.actor,readiness=replace(self.ready,capabilities=frozenset({'commerce.write'})),review_id='11111111-1111-4111-8111-111111111111',recipient_actor_id=self.actor.actor_id,expires_at=(self.now+timedelta(days=1)).isoformat(),now=self.now,source_version=1)
    def project(self, **kwargs):
        return catalog_review_projection(self.review,self.state,**(dict(principal=self.actor,readiness=self.ready,now=self.now,source_version=1)|kwargs))
    def test_acceptance_is_exact_revision_candidate_not_publication(self):
        payload = dict(commandId='33333333-3333-4333-8333-333333333333',
            reviewId=self.review['reviewId'], previewDigest=self.review['previewDigest'],
            decision='accept_preview_for_release_review')
        def accept(data=payload, **overrides):
            return build_catalog_acceptance(self.review, data, **(dict(
                principal=self.actor, readiness=self.ready, source_version=1, now=self.now) | overrides))
        result = accept()
        self.assertFalse(result['persisted'])
        self.assertFalse(result['publicationAuthorized'])
        self.assertFalse(result['deploymentAuthorized'])
        self.assertEqual(result['sourceVersion'], 1)
        self.assertEqual(result['commandFingerprint'], accept(now=self.now+timedelta(seconds=1))['commandFingerprint'])
        self.assertNotEqual(result['commandFingerprint'], accept(payload | {'commandId': '44444444-4444-4444-8444-444444444444'})['commandFingerprint'])
        for data in [payload | {'decision': 'publish'}, payload | {'previewDigest': 'stale'},
                     payload | {'reviewId': 'other'}, payload | {'extra': True},
                     payload | {'commandId': 'bad'}]:
            with self.subTest(data=data), self.assertRaises(TrialValidationError): accept(data)
        for overrides in [dict(source_version=2), dict(now=self.now+timedelta(days=1)),
                          dict(readiness=replace(self.ready, write_enabled=False)),
                          dict(principal=replace(self.actor, workspace_id='other')),
                          dict(principal=replace(self.actor, actor_id='other'))]:
            with self.subTest(overrides=overrides), self.assertRaises(TrialValidationError): accept(**overrides)
    def test_public_projection_and_copy(self):
        result=self.project()
        self.assertEqual(set(result),{'reviewId','contentRevision','previewDigest','preview','expiresAt','status','publicationAuthorized','deploymentAuthorized'})
        result['preview']['items'][0]['name']='Changed'
        self.assertNotEqual(self.review['preview']['items'][0]['name'],'Changed')
    def test_decisions_use_retained_assignment_without_private_source_access(self):
        common = dict(commandId='33333333-3333-4333-8333-333333333333',
            reviewId=self.review['reviewId'], previewDigest=self.review['previewDigest'])
        for build, payload in [(build_catalog_acceptance, common | {'decision': 'accept_preview_for_release_review'}),
                               (build_catalog_change_request, common | {'note': 'Correct the price'})]:
            def invoke(review):
                return build(review, payload, principal=self.actor, readiness=self.ready,
                             source_version=1, now=self.now)
            with patch('supermega_runtime.ecommerce_customer_review.commerce_storefront_preview', side_effect=AssertionError('private source read')):
                self.assertFalse(invoke(self.review)['persisted'])
            for key, value in [('status', 'stale'), ('status', 'revoked'),
                               ('contentRevision', True), ('contentRevision', -1),
                               ('previewDigest', 'sha256:'+'G'*64),
                               ('preparedAt', (self.now+timedelta(seconds=1)).isoformat()),
                               ('expiresAt', self.now.isoformat())]:
                with self.subTest(builder=build.__name__, key=key, value=value), self.assertRaises(TrialValidationError):
                    invoke(self.review | {key: value})
    def test_feedback_binds_exact_note_and_revision_without_claiming_delivery(self):
        payload = dict(commandId='33333333-3333-4333-8333-333333333333',
            reviewId=self.review['reviewId'], previewDigest=self.review['previewDigest'],
            note='လက်ဖက်ရည်\nPlease correct the price.')
        def feedback(data=payload, **overrides):
            return build_catalog_change_request(self.review, data, **(dict(
                principal=self.actor, readiness=self.ready, source_version=1, now=self.now) | overrides))
        result = feedback()
        self.assertEqual(result['note'], payload['note'])
        self.assertFalse(result['persisted'])
        self.assertFalse(result['publicationAuthorized'])
        self.assertFalse(result['deploymentAuthorized'])
        self.assertEqual(result['commandFingerprint'], feedback(now=self.now+timedelta(seconds=1))['commandFingerprint'])
        self.assertNotEqual(result['commandFingerprint'], feedback(payload | {'note': 'Different change'})['commandFingerprint'])
        self.assertEqual(len(feedback(payload | {'note': 'က'*2000})['note']), 2000)
        for note in ['', ' ', ' padded ', 'က'*2001, '\x00bad', '\ud800', None, 1]:
            with self.subTest(note_type=type(note).__name__), self.assertRaises(TrialValidationError):
                feedback(payload | {'note': note})
        for data in [payload | {'previewDigest': 'stale'}, payload | {'reviewId': 'other'},
                     payload | {'commandId': 'invalid'}, payload | {'decision': 'publish'}]:
            with self.assertRaises(TrialValidationError): feedback(data)
        for overrides in [dict(source_version=2), dict(now=self.now+timedelta(days=1)),
                          dict(readiness=replace(self.ready, write_enabled=False)),
                          dict(principal=replace(self.actor, actor_id='other')),
                          dict(readiness=replace(self.ready, product_entitlements=()))]:
            with self.assertRaises(TrialValidationError): feedback(**overrides)
    def test_identity_capability_and_entitlement(self):
        for change in [dict(principal=replace(self.actor,workspace_id='other')),dict(principal=replace(self.actor,actor_id='other')),dict(principal=replace(self.actor,actor_kind='agent')),dict(readiness=replace(self.ready,capabilities=frozenset({'commerce.read'}))),dict(readiness=replace(self.ready,product_entitlements=())),dict(readiness=replace(self.ready,auth_ready=False))]:
            with self.subTest(change=list(change)),self.assertRaises(TrialValidationError):self.project(**change)
    def test_revoked_expired_and_changed_snapshot(self):
        for key,value in [('status','revoked'),('previewDigest','wrong'),('contentRevision',99)]:
            old=self.review[key];self.review[key]=value
            with self.assertRaises(TrialValidationError):self.project()
            self.review[key]=old
        with self.assertRaises(TrialValidationError):self.project(now=self.now+timedelta(days=1))
        self.state['items'][0]['price']+=1
        with self.assertRaises(TrialValidationError):self.project()

    def test_preparation_rejects_invalid_clock_recipient_and_lifetime(self):
        args=dict(principal=self.actor,readiness=replace(self.ready,capabilities=frozenset({'commerce.write'})),review_id=self.review['reviewId'],recipient_actor_id=self.actor.actor_id,expires_at=self.now+timedelta(days=1),now=self.now,source_version=1)
        invalid=[dict(now=value) for value in (0,False,'',datetime(2026,9,25))]
        invalid += [dict(expires_at=value) for value in (self.now,self.now-timedelta(seconds=1),self.now+timedelta(days=7,seconds=1),'invalid')]
        invalid += [dict(recipient_actor_id=value) for value in ('',None,'not-a-uuid')]
        invalid += [dict(review_id='invalid'),dict(readiness=self.ready),dict(readiness=replace(args['readiness'],write_enabled=False))]
        for change in invalid:
            with self.subTest(change=change),self.assertRaises(TrialValidationError):
                prepare_catalog_review(self.state,**(args|change))
        valid=prepare_catalog_review(self.state,**(args|dict(expires_at=self.now+timedelta(days=7))))
        self.assertEqual(valid['expiresAt'],(self.now+timedelta(days=7)).isoformat())

    def test_projection_rejects_malformed_assignment_and_clock(self):
        invalid=[None,[],{},self.review|{'extra':'private'}]
        invalid += [self.review|{key:value} for key,value in [
            ('preparedAt',self.now),('expiresAt',self.now+timedelta(days=1)),
            ('preparedAt',(self.now+timedelta(seconds=1)).isoformat()),
            ('expiresAt',(self.now+timedelta(days=7,seconds=1)).isoformat()),
            ('preparedBy',None),('preparedBy',''),('preparedBy',' padded '),
            ('reviewId','invalid'),('contentRevision',True),('preview',{}),
        ]]
        for review in invalid:
            with self.subTest(review_type=type(review).__name__),self.assertRaises(TrialValidationError):
                catalog_review_projection(review,self.state,principal=self.actor,readiness=self.ready,now=self.now,source_version=1)
        for clock in (0,False,'',datetime(2026,9,25)):
            with self.subTest(clock=clock),self.assertRaises(TrialValidationError):self.project(now=clock)

    def test_saved_source_version_prevents_reusing_identical_catalog_after_edit(self):
        self.assertEqual(self.review['sourceVersion'], 1)
        for version in (2, 0, -1, True, 1.0, '1', 9_007_199_254_740_992):
            with self.subTest(version=version), self.assertRaises(TrialValidationError):
                self.project(source_version=version)
        for version in (0, -1, True, 1.0, '1', 9_007_199_254_740_992):
            with self.subTest(prepare_version=version), self.assertRaises(TrialValidationError):
                prepare_catalog_review(self.state, principal=self.actor,
                    readiness=replace(self.ready, capabilities=frozenset({'commerce.write'})),
                    review_id=self.review['reviewId'], recipient_actor_id=self.actor.actor_id,
                    expires_at=self.now+timedelta(days=1), now=self.now, source_version=version)
        self.review['sourceVersion'] = True
        with self.assertRaises(TrialValidationError): self.project()
