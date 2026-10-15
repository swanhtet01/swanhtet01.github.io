"""Replay actual TypeScript review output through the managed backend reducer.

Run node --test tools/website_approval_confirmation.test.mjs first.
No database, credentials, provider writes or network access are used.
"""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from supermega_runtime.website_runtime import reduce_website_state, validate_website_state

states = json.loads((ROOT / '.tmp/sites-guided-review-20261010/transitions.json').read_text(encoding='utf-8'))
assert len(states) == 6
validate_website_state(states[0])
for prior, following in zip(states, states[1:]):
    event = following['events'][0]
    kind = {
        'publish_evidence_recorded': 'website.evidence.recorded',
        'website_revision_approved': 'website.revision.approved',
        'local_snapshot_recorded': 'website.snapshot.recorded',
    }[event['action']]
    proof = {
        'actionId': event['subjectId'], 'capturedAt': event['createdAt'],
        'actor': event['actor'], 'reason': event['reason'],
        'evidenceReference': event['evidenceReference'],
    }
    reduce_website_state(kind, prior, {'state': following, 'evidence': proof})
print('PASS: five actual frontend review transitions accepted by backend reducer')
