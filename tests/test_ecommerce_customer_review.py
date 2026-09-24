"""Synthetic private catalog domain tests; no provider access."""
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from supermega_runtime.ecommerce_customer_review import prepare_catalog_review, catalog_review_projection
from supermega_runtime.trial_store import TrialPrincipal, TrialReadiness, TrialValidationError
from tests.test_commerce_runtime import catalog_state, storefront_configuration

class CatalogReviewTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026,9,25,tzinfo=timezone.utc)
        self.actor = TrialPrincipal('company', '22222222-2222-4222-8222-222222222222', actor_kind='human')
        self.ready = TrialReadiness(backend='synthetic',database_ready=True,role_ready=True,schema_ready=True,auth_ready=True,membership_ready=True,audit_ready=True,write_enabled=True,capabilities=frozenset({'ecommerce.review'}),product_entitlements=('ecommerce',))
        self.state = catalog_state(); self.state['storefrontConfiguration'] = storefront_configuration(self.state)
        self.review = prepare_catalog_review(self.state,principal=self.actor,readiness=replace(self.ready,capabilities=frozenset({'commerce.write'})),review_id='11111111-1111-4111-8111-111111111111',recipient_actor_id=self.actor.actor_id,expires_at=(self.now+timedelta(days=1)).isoformat(),now=self.now)
    def project(self, **kwargs):
        return catalog_review_projection(self.review,self.state,**(dict(principal=self.actor,readiness=self.ready,now=self.now)|kwargs))
    def test_public_projection_and_copy(self):
        result=self.project()
        self.assertEqual(set(result),{'reviewId','contentRevision','previewDigest','preview','expiresAt','status','publicationAuthorized','deploymentAuthorized'})
        result['preview']['items'][0]['name']='Changed'
        self.assertNotEqual(self.review['preview']['items'][0]['name'],'Changed')
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
        args=dict(principal=self.actor,readiness=replace(self.ready,capabilities=frozenset({'commerce.write'})),review_id=self.review['reviewId'],recipient_actor_id=self.actor.actor_id,expires_at=self.now+timedelta(days=1),now=self.now)
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
                catalog_review_projection(review,self.state,principal=self.actor,readiness=self.ready,now=self.now)
        for clock in (0,False,'',datetime(2026,9,25)):
            with self.subTest(clock=clock),self.assertRaises(TrialValidationError):self.project(now=clock)
