"""Isolated committed-transaction catalog tests; generated loopback database only."""
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from uuid import uuid4
import json
import os
import time
import unittest
from tests import test_website_customer_review_sql as fixture
from tools import rehearse_supermega_postgres17 as pg

WORKSPACE, OWNER, RECIPIENT = fixture.WORKSPACE, fixture.OWNER, fixture.RECIPIENT

@unittest.skipUnless(os.environ.get('SUPERMEGA_RUN_WEBSITE_REVIEW_SQL') == '1', 'explicit local SQL rehearsal only')
class CatalogReviewSqlTests(unittest.TestCase):
    # Reuse lifecycle helpers, never inherit the Website test cases or database.
    setUpClass = classmethod(fixture.WebsiteReviewSqlTests.setUpClass.__func__)
    stop = classmethod(fixture.WebsiteReviewSqlTests.stop.__func__)
    context = fixture.WebsiteReviewSqlTests.context
    transaction = fixture.WebsiteReviewSqlTests.transaction

    def test_preparation_and_source_save_serialize_in_both_orders(self):
        # Committed candidate setup belongs only to this isolated disposable cluster.
        from pathlib import Path
        from tests.test_commerce_runtime import catalog_state, storefront_configuration
        from supermega_runtime.commerce_runtime import commerce_storefront_preview,commerce_storefront_preview_digest
        source=catalog_state();source['storefrontConfiguration']=storefront_configuration(source)
        root=Path(__file__).resolve().parents[1]
        with pg._connect(self.admin_url) as connection:
            for name in ('ecommerce_review_projection_candidate.sql','ecommerce_review_storage_candidate.sql'):
                connection.execute((root/'tools'/name).read_text(encoding='utf-8'))
            connection.execute("update app_private.workspace_memberships set capabilities=array['ecommerce.review'] where workspace_id=%s and actor_id=%s",(WORKSPACE,RECIPIENT))
            connection.execute("""insert into app_private.workspace_events
                (event_id,workspace_id,command_id,command_fingerprint,surface,event_type,actor_id,actor_kind,payload_json,result_json)
                values (%s,%s,%s,%s,'company','company.workspace.activated',%s,'human','{"products":["ecommerce"]}'::jsonb,'{}'::jsonb)""",(uuid4(),WORKSPACE,uuid4(),'a'*64,OWNER))
            self.context(connection,OWNER)
            connection.execute("insert into app_private.workspace_state(workspace_id,surface,version,state_json,updated_by) values (%s,'commerce',1,%s::jsonb,%s) on conflict(workspace_id,surface) do update set state_json=excluded.state_json,version=app_private.workspace_state.version+1",(WORKSPACE,json.dumps(source),OWNER))
            version=connection.execute("select version from app_private.workspace_state where workspace_id=%s and surface='commerce'",(WORKSPACE,)).fetchone()[0]
        started=Queue()
        def prepare():
            with pg._connect(self.runtime_url) as writer:
                writer.execute("set statement_timeout='8s'")
                self.context(writer,OWNER)
                started.put(writer.info.backend_pid)
                try:
                    writer.execute("""insert into app_private.ecommerce_customer_reviews
                        (review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at)
                        values (%s,%s,%s,%s,%s,%s::jsonb,%s,clock_timestamp()+interval '1 day')""",
                        (uuid4(),WORKSPACE,RECIPIENT,OWNER,version,json.dumps(commerce_storefront_preview(source)),commerce_storefront_preview_digest(source)))
                except self.db_error as error:
                    writer.rollback()
                    return error.sqlstate
                return 'unexpected_success'
        with pg._connect(self.runtime_url) as blocker:
            self.context(blocker,OWNER)
            blocker.execute("select version from app_private.workspace_state where workspace_id=%s and surface='commerce' for update",(WORKSPACE,))
            with ThreadPoolExecutor(max_workers=1) as pool:
                pending=pool.submit(prepare)
                try:
                    pid=started.get(timeout=5)
                    waiting=False
                    with pg._connect(self.admin_url,autocommit=True) as observer:
                        deadline=time.monotonic()+5
                        while time.monotonic()<deadline:
                            row=observer.execute("select wait_event_type='Lock' from pg_stat_activity where pid=%s",(pid,)).fetchone()
                            if row and row[0]:
                                waiting=True
                                break
                            time.sleep(0.02)
                    self.assertTrue(waiting,'preparation must actually wait on the source row')
                    blocker.execute("update app_private.workspace_state set version=version+1 where workspace_id=%s and surface='commerce'",(WORKSPACE,))
                    blocker.commit()
                    self.assertEqual(pending.result(timeout=10),'40001')
                finally:
                    blocker.rollback()
        with pg._connect(self.admin_url) as connection:
            self.assertEqual(connection.execute('select count(*) from app_private.ecommerce_customer_reviews').fetchone()[0],0)

        def save_source():
            with pg._connect(self.runtime_url) as writer:
                writer.execute("set statement_timeout='8s'")
                self.context(writer,OWNER)
                started.put(writer.info.backend_pid)
                writer.execute("update app_private.workspace_state set version=version+1 where workspace_id=%s and surface='commerce'",(WORKSPACE,))
            return 'committed'
        with pg._connect(self.runtime_url) as preparer:
            self.context(preparer,OWNER)
            current_version=preparer.execute("select version from app_private.workspace_state where workspace_id=%s and surface='commerce'",(WORKSPACE,)).fetchone()[0]
            preparer.execute("""insert into app_private.ecommerce_customer_reviews
                (review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at)
                values (%s,%s,%s,%s,%s,%s::jsonb,%s,clock_timestamp()+interval '1 day')""",
                (uuid4(),WORKSPACE,RECIPIENT,OWNER,current_version,json.dumps(commerce_storefront_preview(source)),commerce_storefront_preview_digest(source)))
            with ThreadPoolExecutor(max_workers=1) as pool:
                pending=pool.submit(save_source)
                try:
                    pid=started.get(timeout=5)
                    waiting=False
                    with pg._connect(self.admin_url,autocommit=True) as observer:
                        deadline=time.monotonic()+5
                        while time.monotonic()<deadline:
                            row=observer.execute("select wait_event_type='Lock' from pg_stat_activity where pid=%s",(pid,)).fetchone()
                            if row and row[0]:
                                waiting=True
                                break
                            time.sleep(0.02)
                    self.assertTrue(waiting,'source save must wait for preparation commit')
                    preparer.commit()
                    self.assertEqual(pending.result(timeout=10),'committed')
                finally:
                    preparer.rollback()
        with self.transaction(OWNER) as connection:
            self.assertEqual(connection.execute('select status from app_private.ecommerce_customer_reviews').fetchall(),[('stale',)])
        with self.transaction(RECIPIENT) as connection:
            self.assertEqual(connection.execute('select preview from app_private.ecommerce_customer_reviews').fetchall(),[])

