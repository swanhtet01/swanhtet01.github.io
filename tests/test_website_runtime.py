from __future__ import annotations

from copy import deepcopy
import unittest

from supermega_runtime.trial_store import TrialValidationError
from supermega_runtime.website_runtime import (
    _website_fingerprint,
    reduce_website_state,
    validate_website_snapshot_source,
    validate_website_state,
)


STAMP = "2026-07-23T03:30:00.000Z"


def _page(page_id: str = "page-home", slug: str = "/") -> dict[str, object]:
    return {
        "id": page_id,
        "internalName": "Home",
        "slug": slug,
        "stage": "ready",
        "navigation": {"label": "Home", "visible": True},
        "hero": {
            "eyebrow": "Operating website",
            "headline": "Run the website with evidence.",
            "summary": "A bounded Website workspace for accountable content and release records.",
            "ctaLabel": "Start",
            "ctaHref": "/start",
        },
        "sections": [
            {
                "id": f"section-{page_id}",
                "eyebrow": "Proof",
                "title": "One clear workflow",
                "body": "Draft, review, approve, and record a snapshot without claiming deployment.",
            }
        ],
        "seo": {"title": "SuperMega Website", "description": "Accountable Website workspace."},
        "updatedAt": STAMP,
    }


def _state() -> dict[str, object]:
    return {
        "schema": "supermega.website.workspace.v2",
        "version": 2,
        "revision": 0,
        "contentRevision": 0,
        "siteName": "SuperMega",
        "pages": [_page()],
        "selectedPageId": "page-home",
        "evidence": [],
        "approvals": [],
        "localPublishes": [],
        "events": [],
    }


def _command(state: dict[str, object], *, action_id: str, reason: str, reference: str) -> dict[str, object]:
    return {
        "state": state,
        "evidence": {
            "actionId": action_id,
            "capturedAt": STAMP,
            "actor": "actor-human",
            "reason": reason,
            "evidenceReference": reference,
        },
    }


def _source(state: dict[str, object]) -> dict[str, object]:
    return {"contentRevision": state["contentRevision"], "digest": _website_fingerprint(state)}


def _reverse_object_keys(value: object) -> object:
    if isinstance(value, list):
        return [_reverse_object_keys(item) for item in value]
    if isinstance(value, dict):
        return {key: _reverse_object_keys(value[key]) for key in reversed(list(value))}
    return value


def _record_evidence(current: dict[str, object], kind: str) -> dict[str, object]:
    next_state = deepcopy(current)
    next_state["revision"] = int(current["revision"]) + 1
    source = _source(current)
    identifier = f"evidence-{kind}"
    finding = f"Verified {kind} evidence"
    reference = f"evidence://{kind}"
    record = {
        "id": identifier,
        "kind": kind,
        "finding": finding,
        "reference": reference,
        "verifiedBy": "actor-human",
        "verifiedAt": STAMP,
        "fingerprint": source["digest"],
        "source": source,
        "migratedFromV1": False,
    }
    event = {
        "id": f"event-{identifier}",
        "createdAt": STAMP,
        "actorKind": "human",
        "actor": "actor-human",
        "action": "publish_evidence_recorded",
        "subjectId": identifier,
        "reason": finding,
        "evidenceReference": reference,
        "source": source,
    }
    next_state["evidence"] = [record, *current["evidence"]]
    next_state["events"] = [event, *current["events"]]
    payload = _command(next_state, action_id=identifier, reason=finding, reference=reference)
    return dict(reduce_website_state("website.evidence.recorded", current, payload))


class WebsiteRuntimeTests(unittest.TestCase):
    def test_fingerprint_matches_browser_utf16_hashing(self) -> None:
        state = _state()
        state["siteName"] = "စူပါမီဂါ 🚀"
        self.assertEqual(_website_fingerprint(state), "web-82a070b9")
        reordered = _reverse_object_keys(state)
        assert isinstance(reordered, dict)
        self.assertEqual(_website_fingerprint(state), _website_fingerprint(reordered))

        control_character = _state()
        control_character["siteName"] = "\x1c"
        blank = _state()
        blank["siteName"] = ""
        self.assertNotEqual(_website_fingerprint(control_character), _website_fingerprint(blank))

    def test_initialization_and_content_save_are_exact(self) -> None:
        state = _state()
        initialized = reduce_website_state(
            "website.workspace.initialized",
            {},
            _command(state, action_id="init", reason="Initialize", reference="website:revision:0"),
        )
        self.assertEqual(initialized, state)

        changed = deepcopy(state)
        changed["revision"] = 1
        changed["contentRevision"] = 1
        changed["siteName"] = "SuperMega Myanmar"
        saved = reduce_website_state(
            "website.content.saved",
            state,
            _command(changed, action_id="content-1", reason="Website draft content saved", reference="website:content:1"),
        )
        self.assertEqual(saved["siteName"], "SuperMega Myanmar")
        self.assertEqual(saved["contentRevision"], 1)

        unchanged = deepcopy(state)
        unchanged["revision"] = 1
        with self.assertRaises(TrialValidationError):
            reduce_website_state(
                "website.content.saved",
                state,
                _command(unchanged, action_id="content-2", reason="Website draft content saved", reference="website:content:1"),
            )

    def test_release_records_require_exact_append_only_lifecycle(self) -> None:
        current = _state()
        draft_page = _page("page-draft", "/draft")
        draft_page["stage"] = "draft"
        draft_page["navigation"]["visible"] = False
        current["pages"].append(draft_page)
        for kind in ("content", "responsive", "links"):
            current = _record_evidence(current, kind)

        source = _source(current)
        evidence_ids = [entry["id"] for entry in current["evidence"]]
        approved = deepcopy(current)
        approved["revision"] = int(current["revision"]) + 1
        approval = {
            "id": "approval-1",
            "reviewer": "actor-human",
            "note": "Ready for an approved snapshot",
            "approvedAt": STAMP,
            "fingerprint": source["digest"],
            "evidenceIds": evidence_ids,
            "source": source,
            "migratedFromV1": False,
        }
        approval_event = {
            "id": "event-approval-1",
            "createdAt": STAMP,
            "actorKind": "human",
            "actor": "actor-human",
            "action": "website_revision_approved",
            "subjectId": "approval-1",
            "reason": approval["note"],
            "evidenceReference": ",".join(evidence_ids),
            "source": source,
        }
        approved["approvals"] = [approval]
        approved["events"] = [approval_event, *current["events"]]
        forged_actor = deepcopy(approved)
        forged_actor["approvals"][0]["reviewer"] = "Spoofed reviewer"
        forged_actor["events"][0]["actor"] = "Spoofed reviewer"
        with self.assertRaises(TrialValidationError):
            reduce_website_state(
                "website.revision.approved",
                current,
                _command(
                    forged_actor,
                    action_id="approval-1",
                    reason=str(approval["note"]),
                    reference=",".join(evidence_ids),
                ),
            )
        current = dict(
            reduce_website_state(
                "website.revision.approved",
                current,
                _command(
                    approved,
                    action_id="approval-1",
                    reason=str(approval["note"]),
                    reference=",".join(evidence_ids),
                ),
            )
        )

        snapshotted = deepcopy(current)
        snapshotted["revision"] = int(current["revision"]) + 1
        publish = {
            "id": "snapshot-1",
            "recordedAt": STAMP,
            "recordedBy": "actor-human",
            "fingerprint": source["digest"],
            "readyPageIds": ["page-home"],
            "approvalId": "approval-1",
            "evidenceIds": evidence_ids,
            "source": source,
            "migratedFromV1": False,
        }
        publish_event = {
            "id": "event-snapshot-1",
            "createdAt": STAMP,
            "actorKind": "human",
            "actor": "actor-human",
            "action": "local_snapshot_recorded",
            "subjectId": "snapshot-1",
            "reason": "Approved browser-local snapshot recorded",
            "evidenceReference": "approval-1",
            "source": source,
        }
        snapshotted["localPublishes"] = [publish]
        snapshotted["events"] = [publish_event, *current["events"]]
        incomplete_page_set = deepcopy(snapshotted)
        incomplete_page_set["localPublishes"][0]["readyPageIds"] = []
        with self.assertRaises(TrialValidationError):
            reduce_website_state(
                "website.snapshot.recorded",
                current,
                _command(
                    incomplete_page_set,
                    action_id="snapshot-1",
                    reason="Approved browser-local snapshot recorded",
                    reference="approval-1",
                ),
            )
        draft_included = deepcopy(snapshotted)
        draft_included["localPublishes"][0]["readyPageIds"] = ["page-home", "page-draft"]
        with self.assertRaises(TrialValidationError):
            reduce_website_state(
                "website.snapshot.recorded",
                current,
                _command(
                    draft_included,
                    action_id="snapshot-1",
                    reason="Approved browser-local snapshot recorded",
                    reference="approval-1",
                ),
            )
        result = reduce_website_state(
            "website.snapshot.recorded",
            current,
            _command(
                snapshotted,
                action_id="snapshot-1",
                reason="Approved browser-local snapshot recorded",
                reference="approval-1",
            ),
        )
        self.assertEqual(result["localPublishes"][0]["approvalId"], "approval-1")
        intake_source = {
            "fingerprint": source["digest"],
            "approvalId": "approval-1",
            "snapshotId": "snapshot-1",
            "pageId": "page-home",
            "siteName": "SuperMega",
            "pagePath": "/",
        }
        self.assertEqual(validate_website_snapshot_source(result, intake_source), intake_source)
        for field, value in (
            ("fingerprint", "web-deadbeef"),
            ("approvalId", "approval-missing"),
            ("snapshotId", "snapshot-missing"),
            ("pageId", "page-missing"),
        ):
            with self.subTest(intake_source_field=field):
                with self.assertRaises(TrialValidationError):
                    validate_website_snapshot_source(result, {**intake_source, field: value})
        changed_site = deepcopy(result)
        changed_site["siteName"] = "Changed after snapshot"
        with self.assertRaises(TrialValidationError):
            validate_website_snapshot_source(changed_site, intake_source)
        changed_page = deepcopy(result)
        changed_page["pages"][0]["slug"] = "/changed"
        with self.assertRaises(TrialValidationError):
            validate_website_snapshot_source(changed_page, intake_source)
        reverted_content = deepcopy(result)
        reverted_content["revision"] += 2
        reverted_content["contentRevision"] += 2
        self.assertEqual(_website_fingerprint(reverted_content), intake_source["fingerprint"])
        validate_website_state(reverted_content)
        with self.assertRaises(TrialValidationError):
            validate_website_snapshot_source(reverted_content, intake_source)

        tampered = deepcopy(current)
        tampered["revision"] = int(current["revision"]) + 1
        tampered["siteName"] = "Tampered during approval"
        tampered["approvals"] = [approval]
        tampered["events"] = [approval_event, *current["events"]]
        with self.assertRaises(TrialValidationError):
            reduce_website_state(
                "website.revision.approved",
                current,
                _command(tampered, action_id="approval-1", reason=str(approval["note"]), reference=",".join(evidence_ids)),
            )

    def test_initialization_rejects_client_asserted_history_and_invalid_timestamp(self) -> None:
        state = _state()
        state["events"] = [
            {
                "id": "event-fake",
                "createdAt": STAMP,
                "actorKind": "human",
                "actor": "Fake",
                "action": "local_snapshot_recorded",
                "subjectId": "fake",
                "reason": "Fake",
                "evidenceReference": "fake",
                "source": {"contentRevision": 0, "digest": _website_fingerprint(state)},
            }
        ]
        with self.assertRaises(TrialValidationError):
            reduce_website_state(
                "website.workspace.initialized",
                {},
                _command(state, action_id="init", reason="Initialize", reference="website:revision:0"),
            )

        invalid = _state()
        invalid["pages"][0]["updatedAt"] = "2026-07-23T03:30:00Z"
        with self.assertRaises(TrialValidationError):
            validate_website_state(invalid)

        invalid_unicode = _state()
        invalid_unicode["siteName"] = "\ud800"
        with self.assertRaises(TrialValidationError):
            validate_website_state(invalid_unicode)


if __name__ == "__main__":
    unittest.main()
