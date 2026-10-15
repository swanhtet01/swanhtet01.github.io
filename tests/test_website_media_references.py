from contextlib import contextmanager
from uuid import uuid4
import unittest

from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal, TrialValidationError
from supermega_runtime.website_media_references import require_website_media_receipts, website_asset_ids

ASSET = 'a' * 64 + '.webp'
OTHER = 'b' * 64 + '.webp'
STATE = {"pages": [{"hero": {"image": {"assetId": ASSET}}}],
         "localPublishes": [{"artifact": {"pages": [{"sections": [{"image": {"assetId": OTHER}}]}]}}]}


class Cursor:
    def __init__(self):
        self.events = {"workspace-a": {ASSET, OTHER}}
        self.executions = []
        self.rows = []
    def execute(self, sql, params=()):
        self.executions.append((sql, params))
        if 'select distinct' in sql:
            self.rows = [{"asset_id": asset} for asset in self.events.get(params[0], set()) if asset in params[1]]
    def fetchall(self): return self.rows
    def fetchone(self): return None


class MediaReferenceTests(unittest.TestCase):
    def test_current_and_retained_assets_need_same_workspace_receipts(self):
        cursor = Cursor()
        self.assertEqual(website_asset_ids(STATE), {ASSET, OTHER})
        require_website_media_receipts(cursor, 'workspace-a', STATE)
        with self.assertRaises(TrialValidationError): require_website_media_receipts(cursor, 'workspace-b', STATE)
        cursor.events['workspace-a'].remove(OTHER)
        with self.assertRaises(TrialValidationError): require_website_media_receipts(cursor, 'workspace-a', STATE)

    def test_legacy_and_linked_images_do_not_require_storage(self):
        cursor = Cursor()
        require_website_media_receipts(cursor, 'workspace-b', {'pages': [{'hero': {'image': {'src': 'https://example.com/a.jpg'}}}]})
        self.assertEqual(cursor.executions, [])

    def test_real_command_path_denies_unknown_asset_before_state_or_event_write(self):
        cursor = Cursor()
        class Store(PostgresTrialStore):
            @contextmanager
            def _guarded_cursor(self, *args, **kwargs): yield cursor, {'website.write'}
        store = Store('', reducer=lambda *args: STATE, write_enabled=True)
        def command(workspace):
            return store.apply_command(TrialPrincipal(workspace, 'operator', 'human'), command_id=str(uuid4()),
                surface='website', event_type='website.content.saved', expected_version=0,
                payload={'state': STATE, 'evidence': {'actor': 'operator', 'actionId': 'photo-save', 'reason': 'Edit photo',
                    'capturedAt': '2026-10-10T00:00:00Z', 'evidenceReference': 'unit-test'}})
        with self.assertRaises(TrialValidationError): command('workspace-b')
        self.assertFalse(any('insert into' in sql or 'update app_private.workspace_state' in sql for sql, _ in cursor.executions))
        cursor.executions.clear()
        self.assertEqual(command('workspace-a').version, 1)
        queries = [sql for sql, _ in cursor.executions]
        checked = next(i for i, sql in enumerate(queries) if 'select distinct' in sql)
        written = next(i for i, sql in enumerate(queries) if 'insert into app_private.workspace_state' in sql)
        self.assertLess(checked, written)


if __name__ == '__main__': unittest.main()
