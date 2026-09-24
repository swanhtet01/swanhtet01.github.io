"""Decision storage on generated loopback PostgreSQL only; no managed target."""
import json
import os
from pathlib import Path
from hashlib import sha256
from uuid import uuid4
import unittest
from tests import test_website_customer_review_sql as fixture
from tools import rehearse_supermega_postgres17 as pg

@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_WEBSITE_REVIEW_SQL') == '1', 'explicit disposable SQL only')
class CatalogDecisionSqlTests(unittest.TestCase):
    stop = classmethod(fixture.WebsiteReviewSqlTests.stop.__func__)
    context = fixture.WebsiteReviewSqlTests.context

    @classmethod
    def setUpClass(cls):
        fixture.WebsiteReviewSqlTests.setUpClass.__func__(cls)
        migration = Path(__file__).resolve().parents[1] / 'supabase/migrations/20260924231714_ecommerce_customer_decisions.sql'
        with pg._connect(cls.admin_url) as connection:
            connection.execute(migration.read_text(encoding='utf-8'))

    def test_decisions_are_private_immutable_and_mutually_exclusive(self):
        from tests.test_commerce_runtime import catalog_state, storefront_configuration
        from supermega_runtime.commerce_runtime import commerce_storefront_preview, commerce_storefront_preview_digest
        workspace, owner, recipient = fixture.WORKSPACE, fixture.OWNER, fixture.RECIPIENT
        source = catalog_state(); source['storefrontConfiguration'] = storefront_configuration(source)
        digest = commerce_storefront_preview_digest(source)
        reviews = [str(uuid4()), str(uuid4()), str(uuid4())]
        with pg._connect(self.admin_url) as connection:
            connection.execute("update app_private.workspace_memberships set capabilities=array['ecommerce.review'] where workspace_id=%s and actor_id=%s", (workspace,recipient))
            connection.execute("""insert into app_private.workspace_events
              (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,actor_id,actor_kind,payload_json,result_json)
              values (%s,%s,%s,%s,'company','company.workspace.activated',%s,'human','{"products":["ecommerce"]}'::jsonb,'{}'::jsonb)""", (uuid4(),workspace,uuid4(),'a'*64,owner))
            self.context(connection,owner)
            connection.execute("insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by) values (%s,'commerce',1,%s::jsonb,%s)", (workspace,json.dumps(source),owner))
        with pg._connect(self.runtime_url) as connection:
            self.context(connection,owner)
            for review in reviews:
                connection.execute("""insert into app_private.ecommerce_customer_reviews
                  (review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at)
                  values (%s,%s,%s,%s,1,%s::jsonb,%s,clock_timestamp()+interval '1 day')""",
                  (review,workspace,recipient,owner,json.dumps(commerce_storefront_preview(source)),digest))
        def insert(connection, review, kind, *, bad_digest=False, source_version=1):
            command = str(uuid4())
            note = 'စျေးနှုန်း ပြင်ပါ' if kind == 'feedback' else None
            identity = dict(contract='supermega.ecommerce.customer-'+('acceptance' if kind=='acceptance' else 'feedback')+'.v1',
              workspaceId=workspace,actorId=recipient,commandId=command,reviewId=review,sourceVersion=source_version,
              contentRevision=source['storefrontConfiguration']['revision'],previewDigest=digest)
            identity.update(dict(decision='accept_preview_for_release_review') if kind=='acceptance' else dict(note=note))
            fingerprint='sha256:'+sha256(json.dumps(identity,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
            return connection.execute("""insert into app_private.ecommerce_customer_decisions
              (workspace_id,actor_id,command_id,review_id,source_version,content_revision,preview_digest,command_fingerprint,kind,note)
              values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning command_id""",
              (workspace,recipient,command,review,source_version,identity['contentRevision'],digest,'sha256:'+'0'*64 if bad_digest else fingerprint,kind,note)).fetchone()[0]
        with pg._connect(self.runtime_url) as connection:
            self.context(connection,recipient)
            with self.assertRaises(self.db_error), connection.transaction():
                insert(connection,reviews[0],'acceptance',bad_digest=True)
            with self.assertRaises(self.db_error) as stale, connection.transaction():
                insert(connection,reviews[0],'acceptance',source_version=2)
            self.assertEqual(stale.exception.sqlstate, '42501')
            self.context(connection,owner)
            with self.assertRaises(self.db_error) as wrong_actor, connection.transaction():
                insert(connection,reviews[0],'acceptance')
            self.assertEqual(wrong_actor.exception.sqlstate, '42501')
            connection.execute("update app_private.ecommerce_customer_reviews set status='revoked' where review_id=%s", (reviews[2],))
            self.context(connection,recipient)
            with self.assertRaises(self.db_error) as revoked, connection.transaction():
                insert(connection,reviews[2],'feedback')
            self.assertEqual(revoked.exception.sqlstate, '42501')
            insert(connection,reviews[0],'acceptance')
            insert(connection,reviews[1],'feedback')
            for review, kind in [(reviews[0],'feedback'),(reviews[0],'acceptance'),(reviews[1],'acceptance')]:
                with self.assertRaises(self.db_error), connection.transaction(): insert(connection,review,kind)
            for sql in ["update app_private.ecommerce_customer_decisions set note='changed'", "delete from app_private.ecommerce_customer_decisions"]:
                with self.assertRaises(self.db_error), connection.transaction(): connection.execute(sql)
            self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_decisions').fetchone()[0],2)
            self.context(connection,recipient,workspace='other-company')
            self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_decisions').fetchone()[0],0)
        # Even a privileged maintenance role cannot silently rewrite history.
        with pg._connect(self.admin_url) as connection:
            for sql in ["update app_private.ecommerce_customer_decisions set note='changed'", "delete from app_private.ecommerce_customer_decisions"]:
                with self.assertRaises(self.db_error) as immutable, connection.transaction():
                    connection.execute(sql)
                self.assertEqual(immutable.exception.sqlstate, '55000')
            self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_decisions').fetchone()[0],2)
        with pg._connect(self.runtime_url) as connection:
            self.context(connection,owner)
            connection.execute("update app_private.workspace_state set version=version+1 where workspace_id=%s and surface='commerce'", (workspace,))
            self.context(connection,recipient)
            with self.assertRaises(self.db_error) as stale, connection.transaction():
                insert(connection,reviews[1],'feedback')
            self.assertEqual(stale.exception.sqlstate, '42501')
        with pg._connect(self.admin_url) as connection:
            for role in ('anon','authenticated','service_role'):
                self.assertFalse(connection.execute("select has_table_privilege(%s,'app_private.ecommerce_customer_decisions','SELECT,INSERT,UPDATE,DELETE')",(role,)).fetchone()[0])

if __name__ == '__main__': unittest.main()
