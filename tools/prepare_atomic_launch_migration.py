"""Prepare, never remotely apply, the reviewed nine-migration launch batch."""
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.rehearse_self_serve_v13 import EXTRAS


def prepare(manifest):
    rows = manifest['pendingByName']
    if manifest['project'] != 'zvtzwcimpvvtkowflhda' or tuple(Path(row['path']).name for row in rows) != EXTRAS:
        raise ValueError('launch_migration_inventory_invalid')
    parts = []
    for row, name in zip(rows, EXTRAS):
        data = (ROOT / 'supabase/migrations' / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != row['sha256']:
            raise ValueError('launch_migration_hash_changed')
        source = data.decode('utf-8').replace('\r\n', '\n').strip()
        # Exact hash-bound sources only. Remove only their outer transaction;
        # PL/pgSQL BEGIN/END bodies and every substantive statement stay intact.
        start = re.match(r'\A((?:\s|--[^\n]*\n)*)begin;\s*', source, re.I)
        end = re.search(r'\bcommit;\s*\Z', source, re.I)
        if bool(start) != bool(end):
            raise ValueError('launch_migration_transaction_boundary_invalid')
        if start:
            source = start.group(1) + source[start.end():end.start()]
        parts.append('-- Source: ' + name + '\n' + source.strip())
    body = "set local lock_timeout = '5s';\nset local statement_timeout = '60s';\n" + '\n\n'.join(parts)
    batch = 'begin;\n' + body + '\ncommit;\n'
    return {'sql': batch, 'body': body, 'sha256': hashlib.sha256(batch.encode()).hexdigest(),
            'migration_count': len(rows), 'project': manifest['project'],
            'production_apply_authorized': False}


if __name__ == '__main__':
    prepared = prepare(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')))
    print(json.dumps({key: value for key, value in prepared.items() if key not in ('sql', 'body')}))
