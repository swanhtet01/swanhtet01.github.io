"""Opt-in, synthetic PostgreSQL 17 proof for the default-off upload repository.

This creates only a disposable loopback cluster.  Its test-only enabled-site
fixture deliberately removes the v15 false-only CHECK inside that cluster; it
is not an enablement migration or evidence that connected mode may be shipped.
No caller-supplied database URL or production credentials are accepted.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from threading import Event
import unittest
from unittest.mock import patch
from uuid import uuid4

from supermega_runtime.connected_site_v15 import (
    ConnectedSiteV15Adapter,
    ConnectedSiteV15Error,
    PostgresConnectedSiteRepository,
    digest,
)
from supermega_runtime.connected_site_event_feed import read_event_headers
from supermega_runtime.connected_site_runtime import ConnectedSitePrincipal
from tests.connected_site_signed_page_fixture import read_and_sign_test_only_page
from tests import connected_site_signed_page_fixture as signed_fixture
from tests.test_connected_site_event_read import _fixture, _resign
from tests.test_connected_site_v15 import DEVICE_A, DEVICE_B, NOW, _authority, _upload


@unittest.skipUnless(
    os.environ.get("SUPERMEGA_TEST_DISPOSABLE_PG17") == "1",
    "explicit disposable loopback PostgreSQL 17 test only",
)
class ConnectedSitePostgres17Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from tools import rehearse_supermega_postgres17 as pg
        import psycopg

        cls.pg = pg
        cls.psycopg = psycopg
        source_migration = (pg.MIGRATION_DIRECTORY / pg.SOURCE_ONLY_MIGRATIONS[0]).read_text(
            encoding="utf-8"
        )
        if "default false check (connected_enabled = false)" not in source_migration:
            raise RuntimeError("Production connected-site default-off gate changed")
        cls.bin = pg._default_postgres_bin()
        if not (cls.bin / ("postgres.exe" if os.name == "nt" else "postgres")).is_file():
            raise RuntimeError("Existing PostgreSQL 17 required; no install or remote fallback")
        cls.environment = pg._clean_environment(cls.bin)
        pg._postgres_version(pg._binary(cls.bin, "postgres"), cls.environment)
        cls.disposable = pg._disposable_workspace()
        cls.workspace, cls.cleanup_state = cls.disposable.__enter__()
        cls.data = cls.workspace / "primary-data"
        cls.started = False
        cls.addClassCleanup(cls.stop_cluster)
        cls.port = pg._free_loopback_port()
        admin_password = pg._password()
        runtime_password = pg._password()
        pg._initialize_cluster(
            postgres_bin=cls.bin, openssl=pg._default_openssl(),
            data_directory=cls.data, admin_password=admin_password,
            port=cls.port, environment=cls.environment,
        )
        cls.started = True  # A failed start may still leave a live server.
        pg._start_cluster(
            postgres_bin=cls.bin, data_directory=cls.data,
            log_file=cls.workspace / "postgres.log", port=cls.port,
            environment=cls.environment,
        )
        root_url = pg._connection_url("postgres", admin_password, cls.port, "postgres")
        cls.admin_url = pg._connection_url("postgres", admin_password, cls.port, pg.DATABASE_NAME)
        cls.runtime_url = pg._connection_url(pg.RUNTIME_ROLE, runtime_password, cls.port, pg.DATABASE_NAME)
        pg._create_database_and_roles(root_url, pg.DATABASE_NAME)
        with psycopg.connect(cls.admin_url) as connection:
            connection.execute("create role supermega_trial_backend nologin nobypassrls")
            connection.execute("create schema app_private")
            connection.execute("revoke all on schema app_private from public")
            connection.execute("grant usage on schema app_private to supermega_trial_backend")
            connection.execute(
                "create table app_private.trial_schema_meta "
                "(component text primary key, schema_version integer not null, "
                "applied_at timestamptz not null default now())"
            )
            connection.execute(
                "insert into app_private.trial_schema_meta(component,schema_version) "
                "values ('private_trial_backend',14)"
            )
        for migration in pg.SOURCE_ONLY_MIGRATIONS:
            pg._apply_migrations(
                postgres_bin=cls.bin, admin_password=admin_password,
                admin_database_url=cls.admin_url, port=cls.port,
                environment=cls.environment, migrations=(migration,),
            )
        pg._provision_runtime(cls.admin_url, runtime_password)
        # The source migration must stay false-only.  This isolated test needs
        # a synthetic enabled row to reach the transaction code under test.
        with psycopg.connect(cls.admin_url) as connection:
            connection.execute(
                "alter table app_private.connected_sites "
                "drop constraint connected_sites_connected_enabled_check"
            )

    @classmethod
    def stop_cluster(cls) -> None:
        stopped = not cls.started or cls.pg._stop_cluster(
            postgres_bin=cls.bin, data_directory=cls.data,
            environment=cls.environment,
        )
        cls.cleanup_state["stopped"] = stopped
        cls.disposable.__exit__(None, None, None)
        if not stopped:
            raise RuntimeError("connected_site_pg17_cleanup_unreconciled")

    def setUp(self) -> None:
        suffix = uuid4().hex
        self.authority = _authority(f"workspace-{suffix}", f"site-{suffix}", "device-a", DEVICE_A)
        self._seed(self.authority, DEVICE_A)
        self.repository = PostgresConnectedSiteRepository(
            lambda: self.psycopg.connect(self.runtime_url)
        )
        self.adapter = ConnectedSiteV15Adapter(
            authorities={(self.authority.workspace_id, self.authority.site_id): self.authority},
            repository=self.repository, runtime_enabled=True,
        )

    def _seed(self, authority, key) -> None:
        device = next(iter(authority.devices.values()))
        upload = _upload(authority, key=key)
        lease = upload.cloud_proof["lease"]
        with self.psycopg.connect(self.admin_url) as connection:
            connection.execute(
                "insert into app_private.connected_sites "
                "(workspace_id,site_id,protocol_version,connected_enabled,authority_generation,"
                "configuration_generation,revocation_generation,authority_payload_digest) "
                "values (%s,%s,1,true,%s,%s,%s,%s)",
                (authority.workspace_id, authority.site_id, authority.authority_generation,
                 authority.configuration_generation, authority.revocation_generation,
                 authority.authority_payload_digest),
            )
            connection.execute(
                "insert into app_private.connected_site_devices "
                "(workspace_id,site_id,device_id,signing_key_id,signing_public_key,"
                "client_fingerprint,enrollment_evidence_digest,coordinator_binding_digest,"
                "session_generation,status) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,'active')",
                (authority.workspace_id, authority.site_id, device.device_id,
                 device.signing_key_id, device.public_key, device.client_fingerprint,
                 device.enrollment_evidence_digest, device.coordinator_binding_digest,
                 device.session_generation),
            )
            connection.execute(
                "insert into app_private.connected_site_leases "
                "(workspace_id,site_id,lease_id,actor_id,device_id,role,capabilities,"
                "session_generation,revocation_generation,configuration_generation,"
                "issuer_key_id,issuer_public_key,lease_json,lease_digest,issued_at,expires_at,status) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,'active')",
                (authority.workspace_id, authority.site_id, lease["leaseId"],
                 lease["actorId"], device.device_id, lease["role"], lease["capabilities"],
                 lease["sessionGeneration"], lease["revocationGeneration"],
                 authority.configuration_generation, lease["issuerKeyId"],
                 authority.issuer_keys[lease["issuerKeyId"]],
                 json.dumps(lease, sort_keys=True), digest(lease),
                 datetime.fromisoformat(lease["issuedAt"].replace("Z", "+00:00")),
                 datetime.fromisoformat(lease["expiresAt"].replace("Z", "+00:00"))),
            )
            connection.execute(
                "insert into app_private.connected_site_cursors "
                "(workspace_id,site_id,device_id) values (%s,%s,%s)",
                (authority.workspace_id, authority.site_id, device.device_id),
            )

    def _send(self, events, *, after=0, authority=None):
        authority = authority or self.authority
        return self.adapter.reconcile(
            workspace_id=authority.workspace_id, site_id=authority.site_id,
            device_id=next(iter(authority.devices)), session_generation=2,
            revocation_generation=3, after_cursor=after, events=events, now=NOW,
        )

    def _counts(self):
        with self.psycopg.connect(self.admin_url) as connection:
            return tuple(connection.execute(
                f"select count(*) from app_private.{table} where workspace_id=%s and site_id=%s",
                (self.authority.workspace_id, self.authority.site_id),
            ).fetchone()[0] for table in (
                "connected_site_commands", "connected_site_events",
                "connected_site_acknowledgements", "connected_site_upload_batches",
            ))

    def test_lost_reply_exact_batch_replays_without_duplicate_effect(self) -> None:
        first = _upload(self.authority, key=DEVICE_A, cursor=1, command_id="one", aggregate_id="basket-one")
        second = _upload(self.authority, key=DEVICE_A, cursor=2, command_id="two", aggregate_id="basket-two")
        self.assertEqual([d.state for d in self._send([first, second])], ["accepted", "accepted"])
        self.assertEqual([d.state for d in self._send([first, second])], ["replayed", "replayed"])
        self.assertEqual(self._counts(), (2, 2, 2, 1))
        reordered = [
            _upload(self.authority, key=DEVICE_A, cursor=1, command_id="two", aggregate_id="basket-two"),
            _upload(self.authority, key=DEVICE_A, cursor=2, command_id="one", aggregate_id="basket-one"),
        ]
        with self.assertRaisesRegex(ConnectedSiteV15Error, "upload_cursor_conflict"):
            self._send(reordered)
        with self.assertRaisesRegex(ConnectedSiteV15Error, "upload_cursor_conflict"):
            self._send([first, _upload(self.authority, key=DEVICE_A, cursor=2,
                                      command_id="other", aggregate_id="basket-other")])
        self.assertEqual(self._counts(), (2, 2, 2, 1))
        third = _upload(self.authority, key=DEVICE_A, cursor=3,
                        command_id="three", aggregate_id="basket-three")
        self.assertEqual(self._send([third], after=2)[0].state, "accepted")
        self.assertEqual([d.state for d in self._send([first, second])], ["replayed", "replayed"])
        changed_command = _upload(self.authority, key=DEVICE_A, cursor=4,
                                  command_id="one", aggregate_id="changed-basket")
        with self.assertRaisesRegex(ConnectedSiteV15Error, "command_id_digest_conflict"):
            self._send([changed_command], after=3)
        self.assertEqual(self._counts(), (3, 3, 3, 2))

    def test_rollback_and_concurrent_retry_commit_once(self) -> None:
        first = _upload(self.authority, key=DEVICE_A, cursor=1, command_id="one", aggregate_id="basket-one")
        altered = _upload(self.authority, key=DEVICE_A, cursor=2, command_id="one", aggregate_id="basket-other")
        with self.assertRaisesRegex(ConnectedSiteV15Error, "command_id_digest_conflict"):
            self._send([first, altered])
        self.assertEqual(self._counts(), (0, 0, 0, 0))
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self._send([first])[0].state, range(2)))
        self.assertCountEqual(results, ["accepted", "replayed"])
        self.assertEqual(self._counts(), (1, 1, 1, 1))

    def test_runtime_role_cannot_read_another_tenant(self) -> None:
        other = _authority(f"workspace-{uuid4().hex}", f"site-{uuid4().hex}", "device-b", DEVICE_B)
        self._seed(other, DEVICE_B)
        with self.psycopg.connect(self.runtime_url) as connection:
            connection.execute("select set_config('app.workspace_id', %s, true)", (self.authority.workspace_id,))
            connection.execute("select set_config('app.site_id', %s, true)", (self.authority.site_id,))
            rows = connection.execute(
                "select workspace_id from app_private.connected_sites order by workspace_id"
            ).fetchall()
        self.assertEqual(rows, [(self.authority.workspace_id,)])

    def test_signed_read_holds_revocation_row_lock_until_proof_is_sealed(self) -> None:
        read_now = datetime.now(timezone.utc)
        authority, lease, request = _fixture(
            workspace=f"workspace-{uuid4().hex}", site=f"site-{uuid4().hex}",
            now=read_now,
        )
        self._seed(authority, DEVICE_A)
        with self.psycopg.connect(self.admin_url) as connection:
            connection.execute(
                "insert into app_private.connected_site_leases "
                "(workspace_id,site_id,lease_id,actor_id,device_id,role,capabilities,"
                "session_generation,revocation_generation,configuration_generation,"
                "issuer_key_id,issuer_public_key,lease_json,lease_digest,issued_at,expires_at,status) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,'active')",
                (authority.workspace_id, authority.site_id, lease["leaseId"],
                 lease["actorId"], lease["deviceId"], lease["role"],
                 lease["capabilities"], lease["sessionGeneration"],
                 lease["revocationGeneration"], authority.configuration_generation,
                 lease["issuerKeyId"], authority.issuer_keys[lease["issuerKeyId"]],
                 json.dumps(lease, sort_keys=True), digest(lease),
                 datetime.fromisoformat(lease["issuedAt"].replace("Z", "+00:00")),
                 datetime.fromisoformat(lease["expiresAt"].replace("Z", "+00:00"))),
            )
        principal = ConnectedSitePrincipal(
            authority.workspace_id, authority.site_id, "device-a", True,
            "synthetic-gateway",
        )
        entered = Event()
        proceed = Event()
        original_sign = signed_fixture._signature

        def paused_sign(seed, fields):
            entered.set()
            if not proceed.wait(5):
                raise RuntimeError("disposable_pg17_sign_pause_timeout")
            return original_sign(seed, fields)

        try:
            with patch.object(signed_fixture, "_signature", side_effect=paused_sign):
                with ThreadPoolExecutor(max_workers=1) as pool:
                    signed_future = pool.submit(
                        read_and_sign_test_only_page,
                        connection_factory=lambda: self.psycopg.connect(self.runtime_url),
                        principal=principal, authority=authority, lease=lease,
                        request=request, now=read_now,
                        issuer_key_id="test_feed", issuer_seed=23,
                    )
                    self.assertTrue(entered.wait(5), "signer did not reach the locked read")
                    with self.assertRaises(self.psycopg.errors.LockNotAvailable):
                        with self.psycopg.connect(self.admin_url) as connection:
                            connection.execute("set local lock_timeout = '300ms'")
                            connection.execute(
                                "update app_private.connected_sites set revocation_generation="
                                "revocation_generation+1 where workspace_id=%s and site_id=%s",
                                (authority.workspace_id, authority.site_id),
                            )
                    proceed.set()
                    signed = signed_future.result(timeout=5)
        finally:
            proceed.set()
        self.assertEqual(json.loads(signed["proofJson"])["revocationGeneration"],
                         authority.revocation_generation)
        with patch.object(signed_fixture, "_signature", side_effect=RuntimeError("signer_failed")):
            with self.assertRaisesRegex(RuntimeError, "signer_failed"):
                read_and_sign_test_only_page(
                    connection_factory=lambda: self.psycopg.connect(self.runtime_url),
                    principal=principal, authority=authority, lease=lease,
                    request=request, now=read_now,
                    issuer_key_id="test_feed", issuer_seed=23,
                )
        # A failed seal returns no proof and must release its row locks.
        with self.psycopg.connect(self.admin_url) as connection:
            connection.execute("set local lock_timeout = '300ms'")
            connection.execute(
                "update app_private.connected_sites set revocation_generation="
                "revocation_generation+1 where workspace_id=%s and site_id=%s",
                (authority.workspace_id, authority.site_id),
            )
        with self.assertRaisesRegex(ConnectedSiteV15Error, "authority_changed"):
            read_and_sign_test_only_page(
                connection_factory=lambda: self.psycopg.connect(self.runtime_url),
                principal=principal, authority=authority, lease=lease,
                request=request, now=read_now,
                issuer_key_id="test_feed", issuer_seed=23,
            )

    def test_event_header_reader_snapshot_cursor_and_revocation(self) -> None:
        # This opt-in test must run only in the disposable PG17 cluster above.
        read_now = datetime.now(timezone.utc)
        authority, lease, request = _fixture(
            workspace=f"workspace-{uuid4().hex}", site=f"site-{uuid4().hex}",
            now=read_now,
        )
        self._seed(authority, DEVICE_A)
        principal = ConnectedSitePrincipal(
            authority.workspace_id, authority.site_id, "device-a", True,
            "synthetic-gateway",
        )
        with self.psycopg.connect(self.admin_url) as connection:
            connection.execute(
                "insert into app_private.connected_site_leases "
                "(workspace_id,site_id,lease_id,actor_id,device_id,role,capabilities,"
                "session_generation,revocation_generation,configuration_generation,"
                "issuer_key_id,issuer_public_key,lease_json,lease_digest,issued_at,expires_at,status) "
                "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,'active')",
                (authority.workspace_id, authority.site_id, lease["leaseId"],
                 lease["actorId"], lease["deviceId"], lease["role"],
                 lease["capabilities"], lease["sessionGeneration"],
                 lease["revocationGeneration"], authority.configuration_generation,
                 lease["issuerKeyId"], authority.issuer_keys[lease["issuerKeyId"]],
                 json.dumps(lease, sort_keys=True), digest(lease),
                 datetime.fromisoformat(lease["issuedAt"].replace("Z", "+00:00")),
                 datetime.fromisoformat(lease["expiresAt"].replace("Z", "+00:00"))),
            )

        def append_event(sequence, prior):
            event = {"synthetic": "metadata-only", "sequence": sequence,
                     "privateRemark": "must-never-be-in-header"}
            event_digest = digest(event)
            command_id = f"read-fixture-{sequence}"
            command_digest = digest({"command": command_id})
            with self.psycopg.connect(self.admin_url) as connection:
                connection.execute(
                    "insert into app_private.connected_site_commands "
                    "(workspace_id,site_id,command_id,command_digest,command_json,"
                    "proof_json,proof_digest,actor_id,device_id,lease_id,aggregate_type,"
                    "aggregate_id,expected_version,state) "
                    "values (%s,%s,%s,%s,'{}'::jsonb,'{}'::jsonb,%s,%s,%s,%s,%s,%s,%s,'accepted')",
                    (authority.workspace_id, authority.site_id, command_id,
                     command_digest, digest({}), "actor-1", "device-a",
                     lease["leaseId"], "retailCart", command_id, 0),
                )
                connection.execute(
                    "insert into app_private.connected_site_events "
                    "(workspace_id,site_id,event_sequence,event_id,event_digest,"
                    "previous_event_digest,event_json,command_id,command_digest,"
                    "aggregate_type,aggregate_id,aggregate_version) "
                    "values (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,1)",
                    (authority.workspace_id, authority.site_id, sequence,
                     f"read-event-{sequence}", event_digest, prior,
                     json.dumps(event), command_id, command_digest,
                     "retailCart", command_id),
                )
            return event_digest

        first_digest = append_event(1, None)
        signed_now = datetime.now(timezone.utc)
        signed_request = _resign(
            request,
            issuedAt=signed_now.isoformat(
                timespec="milliseconds"
            ).replace("+00:00", "Z"),
        )
        signed = read_and_sign_test_only_page(
            connection_factory=lambda: self.psycopg.connect(self.runtime_url),
            principal=principal, authority=authority, lease=lease,
            request=signed_request, now=signed_now,
            issuer_key_id="test_feed", issuer_seed=23,
        )
        signed_page = json.loads(signed["pageJson"])
        signed_proof = json.loads(signed["proofJson"])
        self.assertEqual(signed_page["headers"][0]["eventDigest"], first_digest)
        self.assertEqual(signed_proof["pageDigest"], signed_page["pageDigest"])
        self.assertEqual(signed_proof["requestDigest"], digest(signed_request))
        self.assertEqual(signed_proof["deviceId"], "device-a")
        self.assertNotIn("privateRemark", signed["pageJson"])

        def page(read_request, *, factory=None):
            return read_event_headers(
                connection_factory=factory or (lambda: self.psycopg.connect(self.runtime_url)),
                principal=principal, authority=authority, lease=lease,
                request=read_request, now=datetime.now(timezone.utc),
            )

        # Pause after snapshot/authority locks but before the page SELECT.
        # A direct test-only writer commits another event during the pause;
        # the first reader must see one snapshot, then reconnect sees both.
        entered = Event()
        proceed = Event()

        class PausedCursor:
            def __init__(self, inner):
                self.inner = inner

            def __enter__(self):
                self.inner.__enter__()
                return self

            def __exit__(self, *args):
                return self.inner.__exit__(*args)

            def execute(self, sql, params=None):
                if "order by event_sequence limit" in sql:
                    entered.set()
                    if not proceed.wait(5):
                        raise RuntimeError("disposable_pg17_page_pause_timeout")
                return self.inner.execute(sql, params)

            def __getattr__(self, name):
                return getattr(self.inner, name)

        class PausedConnection:
            def __init__(self, inner):
                self.inner = inner
                self.autocommit = inner.autocommit

            def __enter__(self):
                self.inner.__enter__()
                return self

            def __exit__(self, *args):
                return self.inner.__exit__(*args)

            def cursor(self):
                return PausedCursor(self.inner.cursor())

        request = _resign(
            request,
            issuedAt=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        )
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(page, request, factory=lambda: PausedConnection(
                self.psycopg.connect(self.runtime_url)))
            self.assertTrue(entered.wait(5), "reader did not reach page query")
            second_digest = append_event(2, first_digest)
            proceed.set()
            first_page = future.result(timeout=5)
        self.assertEqual([row.sequence for row in first_page.headers], [1])
        self.assertEqual(first_page.headers[0].event_digest, first_digest)
        self.assertNotIn("privateRemark", repr(first_page))
        second_page = page(_resign(
            request, afterSequence=1, priorEventDigest=first_digest,
            issuedAt=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        ))
        self.assertEqual([row.sequence for row in second_page.headers], [2])
        self.assertEqual(second_page.headers[0].event_digest, second_digest)
        other = _authority(
            f"workspace-{uuid4().hex}", f"site-{uuid4().hex}",
            "device-b", DEVICE_B,
        )
        self._seed(other, DEVICE_B)
        other_adapter = ConnectedSiteV15Adapter(
            authorities={(other.workspace_id, other.site_id): other},
            repository=self.repository, runtime_enabled=True,
        )
        other_adapter.reconcile(
            workspace_id=other.workspace_id, site_id=other.site_id,
            device_id="device-b", session_generation=2,
            revocation_generation=3, after_cursor=0,
            events=[_upload(other, key=DEVICE_B)], now=NOW,
        )
        with self.psycopg.connect(self.runtime_url) as connection:
            connection.execute(
                "select set_config('app.workspace_id', %s, true)",
                (authority.workspace_id,),
            )
            connection.execute(
                "select set_config('app.site_id', %s, true)",
                (authority.site_id,),
            )
            visible = connection.execute(
                "select workspace_id,event_sequence from app_private.connected_site_events "
                "order by event_sequence"
            ).fetchall()
        self.assertEqual(visible, [(authority.workspace_id, 1),
                                   (authority.workspace_id, 2)])
        with self.assertRaisesRegex(ConnectedSiteV15Error, "cursor_changed"):
            page(_resign(
                request, afterSequence=1, priorEventDigest="f" * 64,
                issuedAt=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            ))
        with self.psycopg.connect(self.admin_url) as connection:
            connection.execute(
                "update app_private.connected_site_leases set status='revoked' "
                "where workspace_id=%s and site_id=%s and lease_id=%s",
                (authority.workspace_id, authority.site_id, lease["leaseId"]),
            )
        with self.assertRaisesRegex(ConnectedSiteV15Error, "lease_changed"):
            page(_resign(
                request,
                issuedAt=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            ))
