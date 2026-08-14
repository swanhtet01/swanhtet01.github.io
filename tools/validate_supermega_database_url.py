#!/usr/bin/env python3
"""Fail-closed activation audit and isolated preview transaction executor.

The database URL is accepted only through an explicitly named environment
variable. The default verifier never prints connection details or applies a
migration and executes every audit probe in a read-only transaction. The
separate rehearsal atomic-apply mode accepts only the exact digest-bound bundle
on stdin and commits it once after a same-transaction clean-catalog guard.
"""

from __future__ import annotations

import argparse
import base64
import binascii
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit


CONTRACT = "supermega_private_trial_database_v10"
REHEARSAL_PREFLIGHT_CONTRACT = "supermega_supabase_rehearsal_preflight_v1"
REHEARSAL_ATOMIC_APPLY_CONTRACT = "supermega_supabase_rehearsal_atomic_apply_v1"
ACTIVATION_TARGET_CONTRACT = "supermega_supabase_activation_target_v1"
ACTIVATION_EVIDENCE_CONTRACT = "supermega_managed_activation_evidence_v1"
SCHEMA = "app_private"
BACKEND_ROLE = "supermega_trial_backend"
TRUSTED_OWNER = "postgres"
SCHEMA_COMPONENT = "private_trial_backend"
SCHEMA_VERSION = 10
EXPECTED_POSTGRES_MAJOR = 17
REHEARSAL_METADATA_INVENTORY_KEYS = (
    "schemas",
    "extensions",
    "relations",
    "columns",
    "constraints",
    "indexes",
    "routines",
    "triggers",
    "policies",
    "rewrite_rules",
    "types",
    "event_triggers",
    "default_acls",
    "roles",
    "role_memberships",
    "role_settings",
    "parameter_acls",
    "publications",
    "publication_relations",
    "publication_namespaces",
    "inheritance",
    "aggregates",
    "casts",
    "operators",
    "sequences",
    "subscriptions",
    "subscription_relations",
    "foreign_data_wrappers",
    "foreign_servers",
    "user_mappings",
    "large_objects",
    "database_configuration",
)
REHEARSAL_ATOMIC_UNIT_NAMES = (
    "20260711081300_public_legacy_baseline.sql",
    "20260722004500_private_trial_backend_role_preflight.sql",
    "20260722005134_private_trial_backend_foundation.sql",
    "20260722142801_private_trial_backend_v2.sql",
    "20260723094500_private_trial_backend_v3_website.sql",
    "20260723144500_private_trial_backend_v4_hardening.sql",
    "20260724204920_private_trial_backend_v5_read_capabilities.sql",
    "20260730113000_private_trial_backend_v6_managed_activation.sql",
    "20260730123000_private_trial_backend_v7_workspace_discovery.sql",
    "20260802161500_private_trial_backend_v8_rls_initplan.sql",
    "20260803063822_private_trial_backend_v9_metadata_rls.sql",
    "20260804102000_private_trial_backend_v10_supabase_session_revocation.sql",
    "20260804_public_browser_quarantine.sql",
)
SAFE_SSL_MODES = frozenset({"require", "verify-ca", "verify-full"})
UNSUPPORTED_SUPABASE_POSTGRES17_EXTENSIONS = frozenset(
    {"timescaledb", "plv8", "pls", "plcoffee", "pgjwt"}
)
EXPECTED_TABLES = frozenset(
    {
        "trial_schema_meta",
        "workspace_memberships",
        "workspace_state",
        "workspace_events",
        "approval_requests",
        "workspace_access_controls",
    }
)
TENANT_TABLES = frozenset(EXPECTED_TABLES - {"trial_schema_meta"})
BROWSER_ROLES = frozenset({"anon", "authenticated", "service_role"})
STORAGE_TABLES = frozenset({"buckets", "objects"})
STORAGE_BASELINE = "private_server_side_only"
EXPECTED_INDEXES = frozenset(
    {
        "trial_schema_meta_pkey",
        "workspace_memberships_pkey",
        "workspace_memberships_actor_directory_idx",
        "workspace_state_pkey",
        "workspace_events_pkey",
        "workspace_events_workspace_id_command_id_key",
        "workspace_events_timeline_idx",
        "approval_requests_pkey",
        "approval_requests_workspace_id_command_id_key",
        "approval_requests_queue_idx",
        "workspace_access_controls_pkey",
        "workspace_access_controls_activation_id_key",
        "workspace_access_controls_authorization_id_key",
    }
)
EXPECTED_INDEX_CONTRACT: dict[str, dict[str, Any]] = {
    "trial_schema_meta_pkey": {
        "table": "trial_schema_meta",
        "keys": ("component",),
        "options": (0,),
        "unique": True,
        "primary": True,
        "constraint": "p",
    },
    "workspace_memberships_pkey": {
        "table": "workspace_memberships",
        "keys": ("workspace_id", "actor_id"),
        "options": (0, 0),
        "unique": True,
        "primary": True,
        "constraint": "p",
    },
    "workspace_memberships_actor_directory_idx": {
        "table": "workspace_memberships",
        "keys": ("actor_id", "actor_kind", "status", "workspace_id"),
        "options": (0, 0, 0, 0),
        "unique": False,
        "primary": False,
        "constraint": None,
    },
    "workspace_state_pkey": {
        "table": "workspace_state",
        "keys": ("workspace_id", "surface"),
        "options": (0, 0),
        "unique": True,
        "primary": True,
        "constraint": "p",
    },
    "workspace_events_pkey": {
        "table": "workspace_events",
        "keys": ("event_id",),
        "options": (0,),
        "unique": True,
        "primary": True,
        "constraint": "p",
    },
    "workspace_events_workspace_id_command_id_key": {
        "table": "workspace_events",
        "keys": ("workspace_id", "command_id"),
        "options": (0, 0),
        "unique": True,
        "primary": False,
        "constraint": "u",
    },
    "workspace_events_timeline_idx": {
        "table": "workspace_events",
        "keys": ("workspace_id", "created_at"),
        "options": (0, 3),
        "unique": False,
        "primary": False,
        "constraint": None,
    },
    "approval_requests_pkey": {
        "table": "approval_requests",
        "keys": ("approval_id",),
        "options": (0,),
        "unique": True,
        "primary": True,
        "constraint": "p",
    },
    "approval_requests_workspace_id_command_id_key": {
        "table": "approval_requests",
        "keys": ("workspace_id", "command_id"),
        "options": (0, 0),
        "unique": True,
        "primary": False,
        "constraint": "u",
    },
    "approval_requests_queue_idx": {
        "table": "approval_requests",
        "keys": ("workspace_id", "status", "requested_at"),
        "options": (0, 0, 3),
        "unique": False,
        "primary": False,
        "constraint": None,
    },
    "workspace_access_controls_pkey": {
        "table": "workspace_access_controls",
        "keys": ("workspace_id",),
        "options": (0,),
        "unique": True,
        "primary": True,
        "constraint": "p",
    },
    "workspace_access_controls_activation_id_key": {
        "table": "workspace_access_controls",
        "keys": ("activation_id",),
        "options": (0,),
        "unique": True,
        "primary": False,
        "constraint": "u",
    },
    "workspace_access_controls_authorization_id_key": {
        "table": "workspace_access_controls",
        "keys": ("authorization_id",),
        "options": (0,),
        "unique": True,
        "primary": False,
        "constraint": "u",
    },
}
EXPECTED_FUNCTIONS = {
    "reject_workspace_event_mutation": ("", "trigger"),
    "guard_workspace_state_update": ("", "trigger"),
    "stamp_workspace_event_insert": ("", "trigger"),
    "guard_approval_mutation": ("", "trigger"),
    "guard_workspace_access_control": ("", "trigger"),
    "workspace_is_active": ("target_workspace_id text", "boolean"),
    "actor_workspace_directory": (
        "",
        "table(workspace_id text, capabilities text[], display_name text)",
    ),
    "supabase_session_is_active": (
        "target_user_id uuid, target_session_id uuid",
        "boolean",
    ),
}
WORKSPACE_ACCESS_FUNCTION_FINGERPRINT = (
    "db273aa3f0342e648db5b5e37560b08009ee22a3e274f9395718bdfbbd257a35"
)
WORKSPACE_DIRECTORY_FUNCTION_FINGERPRINT = (
    "6f7002c211b52aef98a7dd702a1ca112163570ceb03446883ee3d332bea867d0"
)
SUPABASE_SESSION_FUNCTION_FINGERPRINT = (
    "63c4ced17eca7e868b599fb844455c02b0689bb3ee22f9f3d71dc78f2a25902a"
)
EXPECTED_NON_OWNER_ACL = frozenset(
    {
        ("schema", SCHEMA, BACKEND_ROLE, "USAGE", False),
        ("table", "trial_schema_meta", BACKEND_ROLE, "SELECT", False),
        ("table", "workspace_memberships", BACKEND_ROLE, "SELECT", False),
        ("table", "workspace_state", BACKEND_ROLE, "SELECT", False),
        ("table", "workspace_state", BACKEND_ROLE, "INSERT", False),
        ("table", "workspace_state", BACKEND_ROLE, "UPDATE", False),
        ("table", "workspace_events", BACKEND_ROLE, "SELECT", False),
        ("table", "workspace_events", BACKEND_ROLE, "INSERT", False),
        ("table", "approval_requests", BACKEND_ROLE, "SELECT", False),
        ("table", "approval_requests", BACKEND_ROLE, "INSERT", False),
        ("table", "approval_requests", BACKEND_ROLE, "UPDATE", False),
        ("table", "workspace_access_controls", BACKEND_ROLE, "SELECT", False),
        ("function", "workspace_is_active", BACKEND_ROLE, "EXECUTE", False),
        ("function", "actor_workspace_directory", BACKEND_ROLE, "EXECUTE", False),
        ("function", "supabase_session_is_active", BACKEND_ROLE, "EXECUTE", False),
    }
)
EXPECTED_BACKEND_ACL_DEPENDENCIES = frozenset(
    {
        ("schema", SCHEMA, 0),
        ("relation", f"{SCHEMA}.trial_schema_meta", 0),
        ("relation", f"{SCHEMA}.workspace_memberships", 0),
        ("relation", f"{SCHEMA}.workspace_state", 0),
        ("relation", f"{SCHEMA}.workspace_events", 0),
        ("relation", f"{SCHEMA}.approval_requests", 0),
        ("relation", f"{SCHEMA}.workspace_access_controls", 0),
        (
            "function",
            f"{SCHEMA}.workspace_is_active(target_workspace_id text)",
            0,
        ),
        ("function", f"{SCHEMA}.actor_workspace_directory()", 0),
        (
            "function",
            f"{SCHEMA}.supabase_session_is_active(target_user_id uuid, target_session_id uuid)",
            0,
        ),
    }
)
EVENT_SURFACE_CONSTRAINT = "workspace_events_approval_surface_v4_check"
EXPECTED_SECURITY_CONSTRAINTS: dict[str, dict[str, str]] = {
    "approval_requests_decision_packet_v2_check": {
        "table": "approval_requests",
        "sha256": "2a65522b7475a40847f181426330ca54ca185c823b539c7471278c03ac835839",
    },
    "approval_requests_terminal_decision_v2_check": {
        "table": "approval_requests",
        "sha256": "7891087b1b69ffddbd350a3f1bfd0417e1b97c4b68da6cdaafb9851dad88a839",
    },
    EVENT_SURFACE_CONSTRAINT: {
        "table": "workspace_events",
        "sha256": "61c55fa60aa2b47ea8cbc5292aad5351fd54a43d15752413c0d6c511d1f5ea10",
    },
}
EXPECTED_TRIGGERS: dict[str, dict[str, Any]] = {
    "workspace_access_control_guard": {
        "table": "workspace_access_controls",
        "function": "guard_workspace_access_control",
        "trigger_type": 31,
        "function_source": """
            begin
              if tg_op = 'INSERT' then
                new.activated_at := transaction_timestamp();
                new.updated_at := transaction_timestamp();
                if new.status = 'suspended' then
                  new.suspended_at := transaction_timestamp();
                end if;
                return new;
              end if;
              if tg_op = 'DELETE' then
                raise exception using errcode = '55000', message = 'workspace access controls cannot be deleted';
              end if;
              if new.workspace_id is distinct from old.workspace_id
                 or new.activation_id is distinct from old.activation_id
                 or new.authorization_id is distinct from old.authorization_id
                 or new.authorization_contract is distinct from old.authorization_contract
                 or new.plan_digest is distinct from old.plan_digest
                 or new.owner_actor_id is distinct from old.owner_actor_id
                 or new.project_ref is distinct from old.project_ref
                 or new.release_commit is distinct from old.release_commit
                 or new.activated_at is distinct from old.activated_at then
                raise exception using errcode = '55000', message = 'workspace activation identity is immutable';
              end if;
              if old.status <> 'active' or new.status <> 'suspended' then
                raise exception using errcode = '55000', message = 'workspace access can only transition from active to suspended';
              end if;
              new.suspended_at := transaction_timestamp();
              new.updated_at := transaction_timestamp();
              return new;
            end
        """,
    },
    "workspace_events_immutable": {
        "table": "workspace_events",
        "function": "reject_workspace_event_mutation",
        "trigger_type": 27,  # ROW | BEFORE | DELETE | UPDATE
        "function_source": """
            begin
              raise exception using
                errcode = '55000',
                message = 'workspace events are immutable';
            end
        """,
    },
    "workspace_state_version_guard": {
        "table": "workspace_state",
        "function": "guard_workspace_state_update",
        "trigger_type": 23,  # ROW | BEFORE | INSERT | UPDATE
        "function_source": """
            begin
              if tg_op = 'INSERT' then
                if new.version <> 1 then
                  raise exception using errcode = '55000', message = 'initial workspace state version must be one';
                end if;
              else
                if new.workspace_id is distinct from old.workspace_id
                   or new.surface is distinct from old.surface then
                  raise exception using errcode = '55000', message = 'workspace state identity is immutable';
                end if;
                if new.version <> old.version + 1 then
                  raise exception using errcode = '40001', message = 'workspace state version must increment by one';
                end if;
              end if;
              new.updated_at := transaction_timestamp();
              return new;
            end
        """,
    },
    "workspace_events_server_timestamp": {
        "table": "workspace_events",
        "function": "stamp_workspace_event_insert",
        "trigger_type": 7,  # ROW | BEFORE | INSERT
        "function_source": """
            begin
              new.created_at := transaction_timestamp();
              return new;
            end
        """,
    },
    "approval_requests_controlled_mutation": {
        "table": "approval_requests",
        "function": "guard_approval_mutation",
        "trigger_type": 31,  # ROW | BEFORE | INSERT | DELETE | UPDATE
        "function_source": """
            begin
              if tg_op = 'INSERT' then
                new.requested_at := transaction_timestamp();
                return new;
              end if;
              if tg_op = 'DELETE' then
                raise exception using errcode = '55000', message = 'approval records cannot be deleted';
              end if;
              if new.approval_id is distinct from old.approval_id
                 or new.workspace_id is distinct from old.workspace_id
                 or new.command_id is distinct from old.command_id
                 or new.command_fingerprint is distinct from old.command_fingerprint
                 or new.title is distinct from old.title
                 or new.proposal_json is distinct from old.proposal_json
                 or new.evidence_refs_json is distinct from old.evidence_refs_json
                 or new.requested_by is distinct from old.requested_by
                 or new.requested_actor_kind is distinct from old.requested_actor_kind
                 or new.requested_at is distinct from old.requested_at
                 or new.decision_contract_version is distinct from old.decision_contract_version then
                raise exception using errcode = '55000', message = 'approval proposal and evidence are immutable';
              end if;
              if old.decision_contract_version <> 2 then
                raise exception using errcode = '55000', message = 'legacy approval must be reissued under decision contract v2';
              end if;
              if old.status <> 'pending' or new.status not in ('approved', 'declined') then
                raise exception using errcode = '55000', message = 'approval transition must be pending to approved or declined';
              end if;
              if new.version <> old.version + 1
                 or new.decided_by is null
                 or new.decided_by <> btrim(new.decided_by)
                 or new.decided_by = ''
                 or new.decided_actor_kind <> 'human'
                 or new.decision_note <> btrim(new.decision_note)
                 or char_length(new.decision_note) not between 1 and 500 then
                raise exception using errcode = '55000', message = 'approval decision requires a named human and nonblank note';
              end if;
              new.decided_at := transaction_timestamp();
              return new;
            end
        """,
    },
}
EXPECTED_POLICIES: dict[str, dict[str, Any]] = {
    "approval_requests_access_gate": {
        "table": "approval_requests",
        "command": "ALL",
        "permissive": "RESTRICTIVE",
        "qual": ("workspace_is_active",),
        "check": ("workspace_is_active",),
    },
    "workspace_access_controls_member_read": {
        "table": "workspace_access_controls",
        "command": "SELECT",
        "permissive": "PERMISSIVE",
        "qual": ("app.workspace_id", "active"),
        "check": (),
    },
    "workspace_memberships_access_gate": {
        "table": "workspace_memberships",
        "command": "ALL",
        "permissive": "RESTRICTIVE",
        "qual": ("workspace_is_active",),
        "check": ("workspace_is_active",),
    },
    "workspace_memberships_self_read": {
        "table": "workspace_memberships",
        "command": "SELECT",
        "permissive": "PERMISSIVE",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "active"),
        "check": (),
    },
    "workspace_state_member_read": {
        "table": "workspace_state",
        "command": "SELECT",
        "permissive": "PERMISSIVE",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "active"),
        "check": (),
    },
    "workspace_state_capability_insert": {
        "table": "workspace_state",
        "command": "INSERT",
        "permissive": "PERMISSIVE",
        "qual": (),
        "check": (
            "app.workspace_id",
            "app.actor_id",
            "app.actor_kind",
            "workspace_memberships",
            "company.write",
            "commerce.write",
            "production.write",
            "website.write",
            "setup.write",
            "version",
        ),
    },
    "workspace_state_capability_update": {
        "table": "workspace_state",
        "command": "UPDATE",
        "permissive": "PERMISSIVE",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships"),
        "check": (
            "app.workspace_id",
            "app.actor_id",
            "app.actor_kind",
            "workspace_memberships",
            "company.write",
            "commerce.write",
            "production.write",
            "website.write",
            "setup.write",
        ),
    },
    "workspace_state_access_gate": {
        "table": "workspace_state",
        "command": "ALL",
        "permissive": "RESTRICTIVE",
        "qual": ("workspace_is_active",),
        "check": ("workspace_is_active",),
    },
    "workspace_events_member_read": {
        "table": "workspace_events",
        "command": "SELECT",
        "permissive": "PERMISSIVE",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "active"),
        "check": (),
    },
    "workspace_events_capability_insert": {
        "table": "workspace_events",
        "command": "INSERT",
        "permissive": "PERMISSIVE",
        "qual": (),
        "check": (
            "app.workspace_id",
            "app.actor_id",
            "app.actor_kind",
            "workspace_memberships",
            "company.write",
            "commerce.write",
            "production.write",
            "website.write",
            "setup.write",
            "approvals.request",
            "approvals.decide",
            "event_type",
            "surface",
            "human",
        ),
        "check_or": "approval_human_guard",
    },
    "workspace_events_access_gate": {
        "table": "workspace_events",
        "command": "ALL",
        "permissive": "RESTRICTIVE",
        "qual": ("workspace_is_active",),
        "check": ("workspace_is_active",),
    },
    "approval_requests_member_read": {
        "table": "approval_requests",
        "command": "SELECT",
        "permissive": "PERMISSIVE",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "active"),
        "check": (),
    },
    "approval_requests_capability_insert": {
        "table": "approval_requests",
        "command": "INSERT",
        "permissive": "PERMISSIVE",
        "qual": (),
        "check": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "approvals.request"),
    },
    "approval_requests_capability_update": {
        "table": "approval_requests",
        "command": "UPDATE",
        "permissive": "PERMISSIVE",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "approvals.decide", "human"),
        "check": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "approvals.decide", "human"),
    },
    "trial_schema_meta_backend_read": {
        "table": "trial_schema_meta",
        "command": "SELECT",
        "permissive": "PERMISSIVE",
        "qual": ("private_trial_backend",),
        "check": (),
    },
}
EXPECTED_POLICY_FINGERPRINTS: dict[str, dict[str, str | None]] = {
    "approval_requests_access_gate": {
        "qual": "62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b",
        "check": "62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b",
    },
    "workspace_access_controls_member_read": {
        "qual": "69de59bcd4afae8fbd45a1f90dbe0513d14c3b4b168ea102636f9abb6f6daadd",
        "check": None,
    },
    "workspace_memberships_access_gate": {
        "qual": "62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b",
        "check": "62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b",
    },
    "workspace_memberships_self_read": {
        "qual": "c80e91747fc9319e19ff36d373cb2d07e01ea65c4085d8e766902b67b488b0b7",
        "check": None,
    },
    "workspace_state_member_read": {
        "qual": "0fd69d13f5845335429f2bc0254d43285c74db27185502b49d71277a1b037e29",
        "check": None,
    },
    "workspace_state_access_gate": {
        "qual": "62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b",
        "check": "62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b",
    },
    "workspace_state_capability_insert": {
        "qual": None,
        "check": "df44792058a637c1aac27a21f11556137aa4bb494b20f9ff594d1f383c451777",
    },
    "workspace_state_capability_update": {
        "qual": "3630de71f046f89fac9d5166b86b9e7e894a99b3d2bd674c27bc31c2205be2eb",
        "check": "912ad42025817aac4572b645e16d22447334cb632a7fde7dceabf9831846360f",
    },
    "workspace_events_member_read": {
        "qual": "a8a421f4fa52e36ac3f5f97e0ac2fab27f4ba9424bd318596cd7274b05f5f669",
        "check": None,
    },
    "workspace_events_access_gate": {
        "qual": "62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b",
        "check": "62b06512b305b9314444df79e58ab5aa64b5d67d60e3449a110f7e1393fa0a5b",
    },
    "workspace_events_capability_insert": {
        "qual": None,
        "check": "0a293401b67ab4c0082a97e208379e2764fb9341e1b54f377b28d7781dc05085",
    },
    "approval_requests_member_read": {
        "qual": "59ee715578ea24aa2483ddaa0debdcd467fb15e23d0c39e5fd6ac9ea360e9f99",
        "check": None,
    },
    "approval_requests_capability_insert": {
        "qual": None,
        "check": "dc2558473062987c688a49447b746d338d158df17178883ede511877b5f70841",
    },
    "approval_requests_capability_update": {
        "qual": "44ecbdc576a99c7e56324a4c1564bcac5c6a81c0057a2bf14a929966bbf725f6",
        "check": "edc4e0b608fcb144beadf0ab88c9647a553f51306071851ce4afd33ad691dfca",
    },
    "trial_schema_meta_backend_read": {
        "qual": "f6f657b1a947cd58fbd8d345a7c33c2192946c21de560121a208f3993d754cd3",
        "check": None,
    },
}


class AuditConfigurationError(ValueError):
    """A safe, user-correctable configuration failure."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _bool(value: Any) -> bool:
    return value is True


def _nonnegative_int(value: Any) -> int | None:
    return value if type(value) is int and value >= 0 else None


def _mapping(row: Any) -> dict[str, Any]:
    if isinstance(row, Mapping):
        return dict(row)
    raise RuntimeError("unexpected_database_row")


def _roles(value: Any) -> frozenset[str]:
    if value is None:
        return frozenset()
    if isinstance(value, str):
        return frozenset(
            part.strip().strip('"')
            for part in value.strip("{}").split(",")
            if part.strip().strip('"')
        )
    if isinstance(value, Sequence):
        return frozenset(str(part) for part in value)
    return frozenset()


def _ordered_texts(value: Any) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return tuple(
            part.strip().strip('"')
            for part in value.strip("{}").split(",")
            if part.strip().strip('"')
        )
    if isinstance(value, Sequence):
        return tuple(str(part) for part in value)
    return ()


def _normalized_index_keys(value: Any) -> tuple[str, ...]:
    return tuple(
        re.sub(r"\s+", " ", item).strip().lower()
        for item in _ordered_texts(value)
    )


def _ordered_ints(value: Any) -> tuple[int, ...]:
    try:
        return tuple(int(item) for item in _ordered_texts(value))
    except (TypeError, ValueError):
        return ()


_POLICY_CAST_RE = re.compile(
    r"::\s*(?:pg_catalog\.)?(?:text|character\s+varying|varchar|name|uuid|boolean|integer|bigint)\b",
    re.IGNORECASE,
)
def _normalized_catalog_expression(expression: Any) -> str | None:
    if expression is None or not str(expression).strip():
        return None
    without_simple_casts = _POLICY_CAST_RE.sub("", str(expression).lower())
    return re.sub(r"\s+", " ", without_simple_casts).strip()


def _catalog_expression_fingerprint(expression: Any) -> str | None:
    normalized = _normalized_catalog_expression(expression)
    if normalized is None:
        return None
    return sha256(normalized.encode("utf-8")).hexdigest()


def _policy_expression_matches(expression: Any, expected_sha256: str | None) -> bool:
    """Require the exact normalized PostgreSQL catalog expression."""

    return _catalog_expression_fingerprint(expression) == expected_sha256


def _safe_runtime_membership_options(row: Mapping[str, Any]) -> bool:
    return (
        row.get("admin_option") is False
        and _bool(row.get("inherit_option"))
        and row.get("set_option") is False
    )


def _safe_hosted_admin_membership(row: Mapping[str, Any]) -> bool:
    return (
        str(row.get("member_role")) == "postgres"
        and str(row.get("grantor_role")) in {"postgres", "supabase_admin"}
        and row.get("admin_option") is True
        and row.get("inherit_option") is False
        and row.get("set_option") is False
    )


def _run_policy_self_test() -> dict[str, Any]:
    membership = (
        "((workspace_id = ( select current_setting('app.workspace_id', true) as current_setting)) "
        "and (actor_id = ( select current_setting('app.actor_id', true) as current_setting)) "
        "and (( select current_setting('app.actor_kind', true) as current_setting) = any "
        "(array['human', 'service', 'agent'])) "
        "and (actor_kind = ( select current_setting('app.actor_kind', true) as current_setting)) "
        "and (status = 'active'))"
    )
    expected = EXPECTED_POLICY_FINGERPRINTS["workspace_memberships_self_read"]["qual"]
    sample_report = {
        "ok": False,
        "ready": False,
        "status": "attention",
        "activation_contract": ACTIVATION_TARGET_CONTRACT,
        "secret_values_exposed": False,
    }
    with tempfile.TemporaryDirectory(prefix="supermega-activation-evidence-") as directory:
        evidence_path = Path(directory) / "receipt.json"
        _write_activation_evidence(sample_report, str(evidence_path))
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    expected_report_digest = sha256(
        json.dumps(sample_report, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    cases = {
        "canonical_membership": _policy_expression_matches(membership, expected),
        "reject_dead_case_wrapper": not _policy_expression_matches(
            f"case when false then true else ({membership}) end",
            expected,
        ),
        "reject_weakened_status": not _policy_expression_matches(
            membership.replace("status = 'active'", "status <> 'revoked'"),
            expected,
        ),
        "reject_inverted_identity_predicates": not _policy_expression_matches(
            membership.replace(" = ", " <> "),
            expected,
        ),
        "reject_swapped_identity_settings": not _policy_expression_matches(
            membership
            .replace("'app.workspace_id'", "'app.__swap__'", 1)
            .replace("'app.actor_id'", "'app.workspace_id'", 1)
            .replace("'app.__swap__'", "'app.actor_id'", 1),
            expected,
        ),
        "null_expression_is_exact": _policy_expression_matches(None, None),
        "accept_supported_extensions": not _unsupported_postgres17_extensions(
            [{"extension_name": "plpgsql"}, {"extension_name": "pgcrypto"}]
        ),
        "reject_removed_postgres17_extension": _unsupported_postgres17_extensions(
            [{"extension_name": "plv8"}, {"extension_name": "plpgsql"}]
        ) == ["plv8"],
        "accept_non_usable_hosted_admin_membership": _safe_hosted_admin_membership(
            {
                "member_role": "postgres",
                "grantor_role": "supabase_admin",
                "admin_option": True,
                "inherit_option": False,
                "set_option": False,
            }
        ),
        "reject_usable_hosted_admin_membership": not _safe_hosted_admin_membership(
            {
                "member_role": "postgres",
                "grantor_role": "supabase_admin",
                "admin_option": True,
                "inherit_option": True,
                "set_option": False,
            }
        ),
        "reject_untrusted_backend_member": not _safe_hosted_admin_membership(
            {
                "member_role": "unexpected_login",
                "grantor_role": "postgres",
                "admin_option": True,
                "inherit_option": False,
                "set_option": False,
            }
        ),
        "activation_receipt_is_sanitized_and_digest_bound": (
            evidence.get("contract") == ACTIVATION_EVIDENCE_CONTRACT
            and evidence.get("report") == sample_report
            and evidence.get("report_sha256") == expected_report_digest
            and evidence.get("secret_values_exposed") is False
        ),
    }
    failed = [name for name, passed in cases.items() if not passed]
    return {
        "ok": not failed,
        "contract": "supermega_rls_policy_validator_self_test",
        "checks": cases,
        "failed_checks": failed,
        "mutation_statements_executed": 0,
        "secret_values_exposed": False,
    }


def _normalized_function_source(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _function_settings(value: Any) -> frozenset[str]:
    if value is None:
        return frozenset()
    if isinstance(value, str):
        return frozenset(
            part.strip().strip('"')
            for part in value.strip("{}").split(",")
            if part.strip().strip('"')
        )
    if isinstance(value, Sequence):
        return frozenset(str(part).strip() for part in value if str(part).strip())
    return frozenset()


def _unsupported_postgres17_extensions(rows: Sequence[Mapping[str, Any]]) -> list[str]:
    installed = {
        str(row.get("extension_name", "")).strip().lower()
        for row in rows
        if str(row.get("extension_name", "")).strip()
    }
    return sorted(installed.intersection(UNSUPPORTED_SUPABASE_POSTGRES17_EXTENSIONS))


def _write_activation_evidence(report: Mapping[str, Any], output_path: str) -> None:
    """Atomically persist only the already-sanitized activation report."""

    destination = Path(output_path).expanduser().resolve()
    if destination.suffix.lower() != ".json":
        raise AuditConfigurationError("activation_evidence_path_must_be_json")
    destination.parent.mkdir(parents=True, exist_ok=True)
    report_payload = json.dumps(report, sort_keys=True, separators=(",", ":"))
    envelope = {
        "contract": ACTIVATION_EVIDENCE_CONTRACT,
        "report_contract": report.get("activation_contract", report.get("contract")),
        "report_sha256": sha256(report_payload.encode("utf-8")).hexdigest(),
        "report": report,
        "secret_values_exposed": False,
    }
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(
            json.dumps(envelope, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def validate_database_url(database_url: str) -> None:
    """Validate shape without returning or exposing any URL component."""

    try:
        parsed = urlsplit(database_url)
        query = parse_qs(parsed.query, keep_blank_values=True)
        _ = parsed.port
    except (TypeError, ValueError) as exc:
        raise AuditConfigurationError("database_url_invalid") from exc
    if parsed.scheme.lower() not in {"postgres", "postgresql"}:
        raise AuditConfigurationError("database_url_scheme_invalid")
    if not parsed.hostname or not parsed.username or parsed.password in (None, ""):
        raise AuditConfigurationError("database_url_credentials_incomplete")
    if not parsed.path or parsed.path == "/" or parsed.fragment:
        raise AuditConfigurationError("database_url_target_invalid")
    if set(query).intersection({"options", "service", "servicefile", "passfile"}):
        raise AuditConfigurationError("database_url_unsafe_option")
    ssl_modes = [value.lower() for value in query.get("sslmode", [])]
    if len(ssl_modes) > 1 or (
        ssl_modes and ssl_modes[0] not in SAFE_SSL_MODES
    ):
        raise AuditConfigurationError("database_url_tls_required")


def validate_supabase_activation_target(
    database_url: str,
    *,
    expected_project_ref: str,
) -> str:
    """Bind one runtime or audit URL to an explicit Supabase project."""

    validate_database_url(database_url)
    expected = expected_project_ref.strip().lower()
    if not re.fullmatch(r"[a-z0-9]{20}", expected):
        raise AuditConfigurationError("activation_expected_project_ref_invalid")

    parsed = urlsplit(database_url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    if set(query) - {"sslmode", "sslrootcert"}:
        raise AuditConfigurationError("activation_connection_parameter_not_allowed")
    root_certificates = query.get("sslrootcert", [])
    if len(root_certificates) > 1 or (root_certificates and not root_certificates[0].strip()):
        raise AuditConfigurationError("activation_ssl_root_certificate_invalid")
    host = str(parsed.hostname or "").lower()
    username = unquote(parsed.username or "")
    port = parsed.port or 5432
    if parsed.path.strip("/") != "postgres":
        raise AuditConfigurationError("activation_database_must_be_postgres")

    direct = re.fullmatch(r"db\.([a-z0-9]{20})\.supabase\.co", host)
    pooler = re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", host)
    if direct:
        if port != 5432:
            raise AuditConfigurationError("activation_direct_port_invalid")
        target_ref = direct.group(1)
        mode = "direct"
    elif pooler:
        pooler_user = re.fullmatch(
            r"[a-zA-Z_][a-zA-Z0-9_-]{0,62}\.([a-z0-9]{20})",
            username,
        )
        if not pooler_user:
            raise AuditConfigurationError("activation_pooler_project_binding_missing")
        target_ref = pooler_user.group(1)
        if port == 6543:
            mode = "transaction_pooler"
        elif port == 5432:
            mode = "session_pooler"
        else:
            raise AuditConfigurationError("activation_pooler_port_invalid")
    else:
        raise AuditConfigurationError("activation_target_not_supabase")

    if target_ref != expected:
        raise AuditConfigurationError("activation_target_ref_mismatch")
    return mode


def _database_url_sslmode(database_url: str) -> str:
    values = parse_qs(
        urlsplit(database_url).query,
        keep_blank_values=True,
    ).get("sslmode", [])
    return values[0].lower() if values else "require"


def validate_ssl_root_certificate(path_value: str) -> str:
    """Resolve a public CA certificate without exposing its local path."""

    if not path_value.strip():
        raise AuditConfigurationError("rehearsal_ssl_root_certificate_missing")
    try:
        path = Path(path_value).resolve(strict=True)
        if not path.is_file() or path.stat().st_size > 1_048_576:
            raise OSError("certificate_file_invalid")
        certificate = path.read_text(encoding="ascii")
    except (OSError, UnicodeError) as exc:
        raise AuditConfigurationError(
            "rehearsal_ssl_root_certificate_invalid"
        ) from exc
    if (
        "-----BEGIN CERTIFICATE-----" not in certificate
        or "-----END CERTIFICATE-----" not in certificate
        or "PRIVATE KEY-----" in certificate
    ):
        raise AuditConfigurationError("rehearsal_ssl_root_certificate_invalid")
    return str(path)


def validate_supabase_rehearsal_target(
    database_url: str,
    *,
    expected_project_ref: str,
    production_project_ref: str,
) -> str:
    """Bind a migration preflight to one explicit non-production Supabase target."""

    validate_database_url(database_url)
    expected = expected_project_ref.strip().lower()
    production = production_project_ref.strip().lower()
    if not re.fullmatch(r"[a-z0-9]{20}", expected):
        raise AuditConfigurationError("rehearsal_expected_project_ref_invalid")
    if not re.fullmatch(r"[a-z0-9]{20}", production):
        raise AuditConfigurationError("rehearsal_production_project_ref_invalid")
    if expected == production:
        raise AuditConfigurationError("rehearsal_target_is_production")

    parsed = urlsplit(database_url)
    query = parse_qs(parsed.query, keep_blank_values=True)
    if set(query) - {"sslmode"}:
        raise AuditConfigurationError("rehearsal_connection_parameter_not_allowed")
    if [value.lower() for value in query.get("sslmode", [])] != ["verify-full"]:
        raise AuditConfigurationError("rehearsal_verify_full_required")
    host = str(parsed.hostname or "").lower()
    username = unquote(parsed.username or "")
    port = parsed.port or 5432
    if parsed.path.strip("/") != "postgres":
        raise AuditConfigurationError("rehearsal_database_must_be_postgres")

    direct = re.fullmatch(r"db\.([a-z0-9]{20})\.supabase\.co", host)
    pooler = re.fullmatch(r"[a-z0-9-]+\.pooler\.supabase\.com", host)
    if direct:
        target_ref = direct.group(1)
        if username != "postgres" or port != 5432:
            raise AuditConfigurationError("rehearsal_direct_admin_connection_required")
        mode = "direct"
    elif pooler:
        pooler_user = re.fullmatch(r"postgres\.([a-z0-9]{20})", username)
        if not pooler_user:
            raise AuditConfigurationError("rehearsal_pooler_admin_connection_required")
        target_ref = pooler_user.group(1)
        if port == 6543:
            raise AuditConfigurationError("rehearsal_transaction_pooler_not_for_migrations")
        if port != 5432:
            raise AuditConfigurationError("rehearsal_session_pooler_required")
        mode = "session_pooler"
    else:
        raise AuditConfigurationError("rehearsal_target_not_supabase")

    if target_ref == production:
        raise AuditConfigurationError("rehearsal_target_is_production")
    if target_ref != expected:
        raise AuditConfigurationError("rehearsal_target_ref_mismatch")
    return mode


def collect_supabase_rehearsal_target_snapshot(
    connection: Any,
    *,
    force_read_only: bool = True,
) -> dict[str, Any]:
    """Inspect one migration target in the caller's current transaction."""

    with connection.cursor() as cursor:
        if force_read_only:
            cursor.execute("set transaction read only")
        cursor.execute("set local search_path = pg_catalog")
        cursor.execute(
            """
            with current_login as (
              select rolcreaterole, rolsuper
              from pg_roles
              where rolname = current_user
            )
            select
              current_setting('server_version_num')::integer as server_version_num,
              current_setting('transaction_read_only') = 'on' as transaction_read_only,
              coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as tls_active,
              current_user = session_user as session_role_stable,
              coalesce(
                (select rolcreaterole or rolsuper from current_login),
                false
              ) as can_create_role,
              has_database_privilege(current_user, current_database(), 'CREATE') as can_create_schema,
              current_database() = 'postgres' as postgres_database,
              to_regnamespace('app_private') is null as private_schema_absent,
              not exists (
                select 1 from pg_roles where rolname = 'supermega_trial_backend'
              ) as backend_role_absent,
              not exists (
                select 1
                from pg_class relation_record
                join pg_namespace schema_record
                  on schema_record.oid = relation_record.relnamespace
                where schema_record.nspname = 'public'
                  and relation_record.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
              ) as public_user_relations_absent,
              not exists (
                select 1
                from pg_proc function_record
                join pg_namespace schema_record
                  on schema_record.oid = function_record.pronamespace
                where schema_record.nspname = 'public'
              ) as public_routines_absent,
              not exists (
                select 1 from pg_event_trigger
              ) as event_triggers_absent,
              not exists (
                select 1
                from pg_subscription subscription_record
                where subscription_record.subdbid = (
                  select oid from pg_database where datname = current_database()
                )
              ) as subscriptions_absent,
              not exists (select 1 from pg_foreign_server) as foreign_servers_absent,
              not exists (select 1 from pg_user_mapping) as user_mappings_absent,
              not exists (select 1 from pg_largeobject_metadata) as large_objects_absent,
              not exists (
                select 1
                from pg_namespace schema_record
                where schema_record.nspname !~ '^pg_'
                  and schema_record.nspname not in (
                    'information_schema', 'public', 'auth', 'storage',
                    'extensions', 'graphql', 'graphql_public', 'realtime',
                    'supabase_functions', 'supabase_migrations', 'vault',
                    'net', 'cron', 'pgmq', '_analytics', '_realtime',
                    'pgbouncer', 'pgsodium', 'pgsodium_masks'
                  )
              ) as unexpected_user_schemas_absent,
              jsonb_build_object(
                'schemas', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    pg_get_userbyid(schema_record.nspowner),
                    coalesce(schema_record.nspacl::text, '')
                  ) order by schema_record.nspname)
                  from pg_namespace schema_record
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'extensions', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    extension_record.extname,
                    extension_record.extversion,
                    schema_record.nspname,
                    pg_get_userbyid(extension_record.extowner),
                    extension_record.extrelocatable
                  ) order by extension_record.extname)
                  from pg_extension extension_record
                  join pg_namespace schema_record
                    on schema_record.oid = extension_record.extnamespace
                ), '[]'::jsonb),
                'relations', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    relation_record.relname,
                    relation_record.relkind,
                    relation_record.relpersistence,
                    pg_get_userbyid(relation_record.relowner),
                    coalesce(relation_record.relacl::text, ''),
                    relation_record.relrowsecurity,
                    relation_record.relforcerowsecurity,
                    relation_record.relreplident,
                    relation_record.relispartition,
                    coalesce(relation_record.reloptions::text, ''),
                    coalesce(relation_record.relpartbound::text, ''),
                    case when relation_record.relkind in ('v', 'm') then
                      'sha256:' || encode(sha256(convert_to(
                        coalesce(pg_get_viewdef(relation_record.oid, true), ''), 'UTF8'
                      )), 'hex')
                    else '' end
                  ) order by schema_record.nspname, relation_record.relname)
                  from pg_class relation_record
                  join pg_namespace schema_record
                    on schema_record.oid = relation_record.relnamespace
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'columns', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    relation_record.relname,
                    attribute_record.attnum,
                    attribute_record.attname,
                    attribute_record.atttypid::regtype::text,
                    attribute_record.atttypmod,
                    attribute_record.attnotnull,
                    attribute_record.attidentity,
                    attribute_record.attgenerated,
                    coalesce(attribute_record.attacl::text, ''),
                    case when default_record.adbin is null then '' else
                      'sha256:' || encode(sha256(convert_to(
                        pg_get_expr(default_record.adbin, default_record.adrelid, true), 'UTF8'
                      )), 'hex')
                    end
                  ) order by schema_record.nspname, relation_record.relname,
                             attribute_record.attnum)
                  from pg_attribute attribute_record
                  join pg_class relation_record
                    on relation_record.oid = attribute_record.attrelid
                  join pg_namespace schema_record
                    on schema_record.oid = relation_record.relnamespace
                  left join pg_attrdef default_record
                    on default_record.adrelid = attribute_record.attrelid
                   and default_record.adnum = attribute_record.attnum
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                    and attribute_record.attnum > 0
                    and not attribute_record.attisdropped
                ), '[]'::jsonb),
                'constraints', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    coalesce(relation_record.relname, ''),
                    constraint_record.conname,
                    constraint_record.contype,
                    constraint_record.condeferrable,
                    constraint_record.condeferred,
                    constraint_record.convalidated,
                    'sha256:' || encode(sha256(convert_to(
                      pg_get_constraintdef(constraint_record.oid, true), 'UTF8'
                    )), 'hex')
                  ) order by schema_record.nspname,
                             coalesce(relation_record.relname, ''),
                             constraint_record.conname)
                  from pg_constraint constraint_record
                  join pg_namespace schema_record
                    on schema_record.oid = constraint_record.connamespace
                  left join pg_class relation_record
                    on relation_record.oid = constraint_record.conrelid
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'indexes', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    table_record.relname,
                    index_record.relname,
                    index_catalog.indisunique,
                    index_catalog.indisprimary,
                    index_catalog.indisvalid,
                    index_catalog.indisready,
                    index_catalog.indislive,
                    'sha256:' || encode(sha256(convert_to(
                      pg_get_indexdef(index_catalog.indexrelid, 0, true), 'UTF8'
                    )), 'hex')
                  ) order by schema_record.nspname, table_record.relname,
                             index_record.relname)
                  from pg_index index_catalog
                  join pg_class index_record
                    on index_record.oid = index_catalog.indexrelid
                  join pg_class table_record
                    on table_record.oid = index_catalog.indrelid
                  join pg_namespace schema_record
                    on schema_record.oid = table_record.relnamespace
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'routines', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    function_record.proname,
                    pg_get_function_identity_arguments(function_record.oid),
                    function_record.prokind,
                    function_record.prosecdef,
                    pg_get_userbyid(function_record.proowner),
                    language_record.lanname,
                    function_record.proleakproof,
                    function_record.provolatile,
                    function_record.proparallel,
                    function_record.proisstrict,
                    function_record.proretset,
                    function_record.prorettype::regtype::text,
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(function_record.proconfig::text, ''), 'UTF8'
                    )), 'hex'),
                    coalesce(function_record.proacl::text, ''),
                    'sha256:' || encode(sha256(convert_to(concat_ws(E'\n',
                      function_record.prosrc,
                      function_record.probin,
                      pg_get_function_arguments(function_record.oid),
                      pg_get_function_result(function_record.oid),
                      case when function_record.prokind in ('f', 'p')
                        then pg_get_functiondef(function_record.oid)
                        else ''
                      end
                    ), 'UTF8')), 'hex')
                  ) order by schema_record.nspname, function_record.proname,
                             pg_get_function_identity_arguments(function_record.oid))
                  from pg_proc function_record
                  join pg_namespace schema_record
                    on schema_record.oid = function_record.pronamespace
                  join pg_language language_record
                    on language_record.oid = function_record.prolang
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'triggers', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    relation_record.relname,
                    trigger_record.tgname,
                    trigger_record.tgenabled,
                    trigger_record.tgisinternal,
                    trigger_record.tgfoid::regprocedure::text,
                    'sha256:' || encode(sha256(convert_to(
                      pg_get_triggerdef(trigger_record.oid, true), 'UTF8'
                    )), 'hex')
                  ) order by schema_record.nspname, relation_record.relname,
                             trigger_record.tgname)
                  from pg_trigger trigger_record
                  join pg_class relation_record
                    on relation_record.oid = trigger_record.tgrelid
                  join pg_namespace schema_record
                    on schema_record.oid = relation_record.relnamespace
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'policies', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    relation_record.relname,
                    policy_record.polname,
                    policy_record.polpermissive,
                    policy_record.polcmd,
                    coalesce((
                      select jsonb_agg(
                        coalesce(role_record.rolname, 'PUBLIC')
                        order by coalesce(role_record.rolname, 'PUBLIC')
                      )
                      from unnest(policy_record.polroles) as policy_role(role_oid)
                      left join pg_roles role_record
                        on role_record.oid = policy_role.role_oid
                    ), '[]'::jsonb),
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(pg_get_expr(policy_record.polqual, policy_record.polrelid, true), ''),
                      'UTF8'
                    )), 'hex'),
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(pg_get_expr(policy_record.polwithcheck, policy_record.polrelid, true), ''),
                      'UTF8'
                    )), 'hex')
                  ) order by schema_record.nspname, relation_record.relname,
                             policy_record.polname)
                  from pg_policy policy_record
                  join pg_class relation_record
                    on relation_record.oid = policy_record.polrelid
                  join pg_namespace schema_record
                    on schema_record.oid = relation_record.relnamespace
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'rewrite_rules', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    relation_record.relname,
                    rewrite_record.rulename,
                    rewrite_record.ev_type,
                    rewrite_record.is_instead,
                    rewrite_record.ev_enabled,
                    'sha256:' || encode(sha256(convert_to(
                      pg_get_ruledef(rewrite_record.oid, true), 'UTF8'
                    )), 'hex')
                  ) order by schema_record.nspname, relation_record.relname,
                             rewrite_record.rulename)
                  from pg_rewrite rewrite_record
                  join pg_class relation_record
                    on relation_record.oid = rewrite_record.ev_class
                  join pg_namespace schema_record
                    on schema_record.oid = relation_record.relnamespace
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'types', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    schema_record.nspname,
                    type_record.typname,
                    type_record.typtype,
                    pg_get_userbyid(type_record.typowner),
                    type_record.typcategory,
                    type_record.typispreferred,
                    type_record.typisdefined,
                    type_record.typdelim,
                    type_record.typnotnull,
                    type_record.typbyval,
                    type_record.typalign,
                    type_record.typstorage,
                    type_record.typtypmod,
                    type_record.typndims,
                    coalesce(nullif(type_record.typrelid, 0)::regclass::text, ''),
                    coalesce(nullif(type_record.typelem, 0)::regtype::text, ''),
                    coalesce(nullif(type_record.typarray, 0)::regtype::text, ''),
                    coalesce(nullif(type_record.typbasetype, 0)::regtype::text, ''),
                    coalesce(nullif(type_record.typcollation, 0)::regcollation::text, ''),
                    type_record.typinput::regprocedure::text,
                    type_record.typoutput::regprocedure::text,
                    coalesce(nullif(type_record.typreceive, 0)::regprocedure::text, ''),
                    coalesce(nullif(type_record.typsend, 0)::regprocedure::text, ''),
                    coalesce(nullif(type_record.typmodin, 0)::regprocedure::text, ''),
                    coalesce(nullif(type_record.typmodout, 0)::regprocedure::text, ''),
                    coalesce(nullif(type_record.typanalyze, 0)::regprocedure::text, ''),
                    coalesce(nullif(type_record.typsubscript, 0)::regprocedure::text, ''),
                    coalesce(type_record.typacl::text, ''),
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(type_record.typdefault, ''), 'UTF8'
                    )), 'hex')
                  ) order by schema_record.nspname, type_record.typname)
                  from pg_type type_record
                  join pg_namespace schema_record
                    on schema_record.oid = type_record.typnamespace
                  where schema_record.nspname !~ '^pg_'
                    and schema_record.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'inheritance', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    child_schema.nspname,
                    child_relation.relname,
                    parent_schema.nspname,
                    parent_relation.relname,
                    inheritance_record.inhseqno,
                    inheritance_record.inhdetachpending
                  ) order by child_schema.nspname, child_relation.relname,
                             inheritance_record.inhseqno)
                  from pg_inherits inheritance_record
                  join pg_class child_relation on child_relation.oid = inheritance_record.inhrelid
                  join pg_namespace child_schema on child_schema.oid = child_relation.relnamespace
                  join pg_class parent_relation on parent_relation.oid = inheritance_record.inhparent
                  join pg_namespace parent_schema on parent_schema.oid = parent_relation.relnamespace
                  where child_schema.nspname !~ '^pg_'
                     or parent_schema.nspname !~ '^pg_'
                ), '[]'::jsonb),
                'aggregates', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    aggregate_record.aggfnoid::regprocedure::text,
                    aggregate_record.aggkind,
                    aggregate_record.aggnumdirectargs,
                    aggregate_record.aggtransfn::regprocedure::text,
                    coalesce(nullif(aggregate_record.aggfinalfn, 0)::regprocedure::text, ''),
                    coalesce(nullif(aggregate_record.aggcombinefn, 0)::regprocedure::text, ''),
                    coalesce(nullif(aggregate_record.aggserialfn, 0)::regprocedure::text, ''),
                    coalesce(nullif(aggregate_record.aggdeserialfn, 0)::regprocedure::text, ''),
                    coalesce(nullif(aggregate_record.aggmtransfn, 0)::regprocedure::text, ''),
                    coalesce(nullif(aggregate_record.aggminvtransfn, 0)::regprocedure::text, ''),
                    coalesce(nullif(aggregate_record.aggmfinalfn, 0)::regprocedure::text, ''),
                    aggregate_record.aggtranstype::regtype::text,
                    coalesce(nullif(aggregate_record.aggmtranstype, 0)::regtype::text, ''),
                    coalesce(nullif(aggregate_record.aggsortop, 0)::regoperator::text, ''),
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(aggregate_record.agginitval, ''), 'UTF8'
                    )), 'hex'),
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(aggregate_record.aggminitval, ''), 'UTF8'
                    )), 'hex')
                  ) order by aggregate_record.aggfnoid::regprocedure::text)
                  from pg_aggregate aggregate_record
                  join pg_proc aggregate_function on aggregate_function.oid = aggregate_record.aggfnoid
                  join pg_namespace aggregate_schema on aggregate_schema.oid = aggregate_function.pronamespace
                  where aggregate_schema.nspname !~ '^pg_'
                    and aggregate_schema.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'casts', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    cast_record.castsource::regtype::text,
                    cast_record.casttarget::regtype::text,
                    coalesce(nullif(cast_record.castfunc, 0)::regprocedure::text, ''),
                    cast_record.castcontext,
                    cast_record.castmethod
                  ) order by cast_record.castsource::regtype::text,
                             cast_record.casttarget::regtype::text)
                  from pg_cast cast_record
                  where cast_record.castsource >= 16384 or cast_record.casttarget >= 16384
                ), '[]'::jsonb),
                'operators', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    operator_schema.nspname,
                    operator_record.oprname,
                    pg_get_userbyid(operator_record.oprowner),
                    operator_record.oprkind,
                    operator_record.oprcanmerge,
                    operator_record.oprcanhash,
                    coalesce(nullif(operator_record.oprleft, 0)::regtype::text, ''),
                    coalesce(nullif(operator_record.oprright, 0)::regtype::text, ''),
                    operator_record.oprresult::regtype::text,
                    operator_record.oprcode::regprocedure::text,
                    coalesce(nullif(operator_record.oprrest, 0)::regprocedure::text, ''),
                    coalesce(nullif(operator_record.oprjoin, 0)::regprocedure::text, '')
                  ) order by operator_schema.nspname, operator_record.oprname,
                             operator_record.oprleft, operator_record.oprright)
                  from pg_operator operator_record
                  join pg_namespace operator_schema on operator_schema.oid = operator_record.oprnamespace
                  where operator_schema.nspname !~ '^pg_'
                    and operator_schema.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'sequences', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    sequence_schema.nspname,
                    sequence_relation.relname,
                    sequence_record.seqtypid::regtype::text,
                    sequence_record.seqstart,
                    sequence_record.seqincrement,
                    sequence_record.seqmax,
                    sequence_record.seqmin,
                    sequence_record.seqcache,
                    sequence_record.seqcycle
                  ) order by sequence_schema.nspname, sequence_relation.relname)
                  from pg_sequence sequence_record
                  join pg_class sequence_relation on sequence_relation.oid = sequence_record.seqrelid
                  join pg_namespace sequence_schema on sequence_schema.oid = sequence_relation.relnamespace
                  where sequence_schema.nspname !~ '^pg_'
                    and sequence_schema.nspname <> 'information_schema'
                ), '[]'::jsonb),
                'event_triggers', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    event_trigger.evtname,
                    event_trigger.evtevent,
                    event_trigger.evtenabled,
                    event_trigger.evtfoid::regprocedure::text
                  ) order by event_trigger.evtname)
                  from pg_event_trigger event_trigger
                ), '[]'::jsonb),
                'default_acls', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    pg_get_userbyid(default_acl.defaclrole),
                    coalesce(schema_record.nspname, ''),
                    default_acl.defaclobjtype,
                    default_acl.defaclacl::text
                  ) order by pg_get_userbyid(default_acl.defaclrole),
                             coalesce(schema_record.nspname, ''),
                             default_acl.defaclobjtype)
                  from pg_default_acl default_acl
                  left join pg_namespace schema_record
                    on schema_record.oid = default_acl.defaclnamespace
                ), '[]'::jsonb),
                'roles', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    role_record.rolname,
                    role_record.rolsuper,
                    role_record.rolinherit,
                    role_record.rolcreaterole,
                    role_record.rolcreatedb,
                    role_record.rolcanlogin,
                    role_record.rolreplication,
                    role_record.rolbypassrls,
                    role_record.rolconnlimit,
                    coalesce(extract(epoch from role_record.rolvaliduntil)::text, '')
                  ) order by role_record.rolname)
                  from pg_roles role_record
                  where role_record.rolname !~ '^pg_'
                ), '[]'::jsonb),
                'role_memberships', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    granted_role.rolname,
                    member_role.rolname,
                    grantor_role.rolname,
                    membership.admin_option,
                    membership.inherit_option,
                    membership.set_option
                  ) order by granted_role.rolname, member_role.rolname,
                             grantor_role.rolname)
                  from pg_auth_members membership
                  join pg_roles granted_role on granted_role.oid = membership.roleid
                  join pg_roles member_role on member_role.oid = membership.member
                  join pg_roles grantor_role on grantor_role.oid = membership.grantor
                  where granted_role.rolname !~ '^pg_'
                     or member_role.rolname !~ '^pg_'
                ), '[]'::jsonb),
                'role_settings', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    coalesce(role_record.rolname, '*'),
                    coalesce(database_record.datname, '*'),
                    'sha256:' || encode(sha256(convert_to(
                      setting_record.setconfig::text, 'UTF8'
                    )), 'hex')
                  ) order by coalesce(role_record.rolname, '*'),
                             coalesce(database_record.datname, '*'))
                  from pg_db_role_setting setting_record
                  left join pg_roles role_record on role_record.oid = setting_record.setrole
                  left join pg_database database_record on database_record.oid = setting_record.setdatabase
                  where setting_record.setdatabase = 0
                     or setting_record.setdatabase = (
                       select oid from pg_database where datname = current_database()
                     )
                ), '[]'::jsonb),
                'parameter_acls', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    parameter_acl.parname,
                    coalesce(parameter_acl.paracl::text, '')
                  ) order by parameter_acl.parname)
                  from pg_parameter_acl parameter_acl
                ), '[]'::jsonb),
                'publications', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    publication_record.pubname,
                    pg_get_userbyid(publication_record.pubowner),
                    publication_record.puballtables,
                    publication_record.pubinsert,
                    publication_record.pubupdate,
                    publication_record.pubdelete,
                    publication_record.pubtruncate,
                    publication_record.pubviaroot
                  ) order by publication_record.pubname)
                  from pg_publication publication_record
                ), '[]'::jsonb),
                'publication_relations', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    publication_record.pubname,
                    schema_record.nspname,
                    relation_record.relname,
                    coalesce(publication_relation.prattrs::text, ''),
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(pg_get_expr(publication_relation.prqual,
                        publication_relation.prrelid, true), ''), 'UTF8'
                    )), 'hex')
                  ) order by publication_record.pubname, schema_record.nspname,
                             relation_record.relname)
                  from pg_publication_rel publication_relation
                  join pg_publication publication_record
                    on publication_record.oid = publication_relation.prpubid
                  join pg_class relation_record
                    on relation_record.oid = publication_relation.prrelid
                  join pg_namespace schema_record
                    on schema_record.oid = relation_record.relnamespace
                ), '[]'::jsonb),
                'publication_namespaces', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    publication_record.pubname,
                    schema_record.nspname
                  ) order by publication_record.pubname, schema_record.nspname)
                  from pg_publication_namespace publication_namespace
                  join pg_publication publication_record
                    on publication_record.oid = publication_namespace.pnpubid
                  join pg_namespace schema_record
                    on schema_record.oid = publication_namespace.pnnspid
                ), '[]'::jsonb),
                'subscriptions', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    subscription_record.subname,
                    pg_get_userbyid(subscription_record.subowner),
                    subscription_record.subenabled,
                    subscription_record.subbinary,
                    subscription_record.substream,
                    subscription_record.subtwophasestate,
                    subscription_record.subdisableonerr,
                    subscription_record.subpasswordrequired,
                    subscription_record.subrunasowner,
                    subscription_record.suborigin,
                    subscription_record.subfailover,
                    coalesce(subscription_record.subslotname, ''),
                    subscription_record.subsynccommit,
                    subscription_record.subpublications::text
                  ) order by subscription_record.subname)
                  from pg_subscription subscription_record
                  where subscription_record.subdbid = (
                    select oid from pg_database where datname = current_database()
                  )
                ), '[]'::jsonb),
                'subscription_relations', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    subscription_record.subname,
                    schema_record.nspname,
                    relation_record.relname,
                    subscription_relation.srsubstate,
                    coalesce(subscription_relation.srsublsn::text, '')
                  ) order by subscription_record.subname,
                             schema_record.nspname, relation_record.relname)
                  from pg_subscription_rel subscription_relation
                  join pg_subscription subscription_record
                    on subscription_record.oid = subscription_relation.srsubid
                  join pg_class relation_record
                    on relation_record.oid = subscription_relation.srrelid
                  join pg_namespace schema_record
                    on schema_record.oid = relation_record.relnamespace
                  where subscription_record.subdbid = (
                    select oid from pg_database where datname = current_database()
                  )
                ), '[]'::jsonb),
                'foreign_data_wrappers', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    wrapper_record.fdwname,
                    pg_get_userbyid(wrapper_record.fdwowner),
                    coalesce(wrapper_record.fdwhandler::regprocedure::text, ''),
                    coalesce(wrapper_record.fdwvalidator::regprocedure::text, ''),
                    coalesce(wrapper_record.fdwacl::text, ''),
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(wrapper_record.fdwoptions::text, ''), 'UTF8'
                    )), 'hex')
                  ) order by wrapper_record.fdwname)
                  from pg_foreign_data_wrapper wrapper_record
                ), '[]'::jsonb),
                'foreign_servers', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    wrapper_record.fdwname,
                    server_record.srvname,
                    pg_get_userbyid(server_record.srvowner),
                    coalesce(server_record.srvtype, ''),
                    coalesce(server_record.srvversion, ''),
                    coalesce(server_record.srvacl::text, ''),
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(server_record.srvoptions::text, ''), 'UTF8'
                    )), 'hex')
                  ) order by wrapper_record.fdwname, server_record.srvname)
                  from pg_foreign_server server_record
                  join pg_foreign_data_wrapper wrapper_record
                    on wrapper_record.oid = server_record.srvfdw
                ), '[]'::jsonb),
                'user_mappings', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    server_record.srvname,
                    coalesce(role_record.rolname, 'PUBLIC'),
                    'sha256:' || encode(sha256(convert_to(
                      coalesce(mapping_record.umoptions::text, ''), 'UTF8'
                    )), 'hex')
                  ) order by server_record.srvname,
                             coalesce(role_record.rolname, 'PUBLIC'))
                  from pg_user_mapping mapping_record
                  join pg_foreign_server server_record
                    on server_record.oid = mapping_record.umserver
                  left join pg_roles role_record
                    on role_record.oid = mapping_record.umuser
                ), '[]'::jsonb),
                'large_objects', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    large_object.oid,
                    pg_get_userbyid(large_object.lomowner),
                    coalesce(large_object.lomacl::text, '')
                  ) order by large_object.oid)
                  from pg_largeobject_metadata large_object
                ), '[]'::jsonb),
                'database_configuration', coalesce((
                  select jsonb_agg(jsonb_build_array(
                    database_record.datname,
                    pg_get_userbyid(database_record.datdba),
                    coalesce(database_record.datacl::text, ''),
                    database_record.datallowconn,
                    database_record.datconnlimit,
                    coalesce(database_record.datcollversion, '')
                  ) order by database_record.datname)
                  from pg_database database_record
                  where database_record.datname = current_database()
                ), '[]'::jsonb)
              ) as metadata_inventory,
              not exists (select 1 from auth.users limit 1) as auth_users_absent,
              not exists (select 1 from auth.sessions limit 1) as auth_sessions_absent,
              not exists (select 1 from storage.buckets limit 1) as storage_buckets_absent,
              not exists (select 1 from storage.objects limit 1) as storage_objects_absent
            """
        )
        return _mapping(cursor.fetchone())


def evaluate_supabase_rehearsal_target_snapshot(
    snapshot: Mapping[str, Any],
    *,
    connection_mode: str,
    target_project_ref: str,
) -> dict[str, Any]:
    try:
        server_version_num = int(snapshot.get("server_version_num", 0))
    except (TypeError, ValueError):
        server_version_num = 0
    metadata_inventory = snapshot.get("metadata_inventory")
    if isinstance(metadata_inventory, str):
        try:
            metadata_inventory = json.loads(metadata_inventory)
        except json.JSONDecodeError:
            metadata_inventory = None
    metadata_inventory_complete = (
        isinstance(metadata_inventory, Mapping)
        and set(metadata_inventory) == set(REHEARSAL_METADATA_INVENTORY_KEYS)
        and all(
            isinstance(metadata_inventory.get(key), list)
            for key in REHEARSAL_METADATA_INVENTORY_KEYS
        )
    )
    metadata_fingerprint_digest = (
        "sha256:"
        + sha256(
            json.dumps(
                metadata_inventory,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        if metadata_inventory_complete
        else None
    )
    checks = {
        "postgres_major_17": server_version_num // 10_000 == EXPECTED_POSTGRES_MAJOR,
        "read_only_encrypted_connection": (
            _bool(snapshot.get("transaction_read_only"))
            and _bool(snapshot.get("tls_active"))
        ),
        "session_role_stable": _bool(snapshot.get("session_role_stable")),
        "administrative_role_can_create_runtime_role": _bool(snapshot.get("can_create_role")),
        "administrative_role_can_create_private_schema": _bool(snapshot.get("can_create_schema")),
        "postgres_database_selected": _bool(snapshot.get("postgres_database")),
        "private_schema_absent": _bool(snapshot.get("private_schema_absent")),
        "backend_role_absent": _bool(snapshot.get("backend_role_absent")),
        "public_user_relations_absent": _bool(
            snapshot.get("public_user_relations_absent")
        ),
        "public_routines_absent": _bool(snapshot.get("public_routines_absent")),
        "event_triggers_absent": _bool(snapshot.get("event_triggers_absent")),
        "subscriptions_absent": _bool(snapshot.get("subscriptions_absent")),
        "foreign_servers_absent": _bool(snapshot.get("foreign_servers_absent")),
        "user_mappings_absent": _bool(snapshot.get("user_mappings_absent")),
        "large_objects_absent": _bool(snapshot.get("large_objects_absent")),
        "unexpected_user_schemas_absent": _bool(
            snapshot.get("unexpected_user_schemas_absent")
        ),
        "provider_metadata_fingerprint_captured": bool(
            re.fullmatch(r"sha256:[0-9a-f]{64}", metadata_fingerprint_digest or "")
        ),
        "complete_provider_catalog_fingerprint": metadata_inventory_complete,
        "auth_users_absent": _bool(snapshot.get("auth_users_absent")),
        "auth_sessions_absent": _bool(snapshot.get("auth_sessions_absent")),
        "storage_buckets_absent": _bool(snapshot.get("storage_buckets_absent")),
        "storage_objects_absent": _bool(snapshot.get("storage_objects_absent")),
    }
    failed = sorted(name for name, passed in checks.items() if not passed)
    return {
        "ok": not failed,
        "ready": not failed,
        "status": "clean_target" if not failed else "attention",
        "contract": REHEARSAL_PREFLIGHT_CONTRACT,
        "connection_mode": connection_mode,
        "target_project_ref": target_project_ref,
        "tls_mode": "verify-full",
        "checks": checks,
        "failed_checks": failed,
        "metadata_inventory": metadata_inventory,
        "metadata_fingerprint_digest": metadata_fingerprint_digest,
        "mutation_statements_executed": 0,
        "secret_values_exposed": False,
        "production_mutated": False,
        "supabase_mutated": False,
        "vercel_mutated": False,
    }


def audit_supabase_rehearsal_target(
    database_url: str,
    *,
    expected_project_ref: str,
    production_project_ref: str,
    ssl_root_cert_path: str,
    connect_factory: Any = None,
) -> dict[str, Any]:
    connection_mode = validate_supabase_rehearsal_target(
        database_url,
        expected_project_ref=expected_project_ref,
        production_project_ref=production_project_ref,
    )
    resolved_ssl_root_cert = validate_ssl_root_certificate(
        ssl_root_cert_path
    )
    connection = (
        connect_factory or _open_supabase_rehearsal_connection
    )(database_url, resolved_ssl_root_cert)
    try:
        snapshot = collect_supabase_rehearsal_target_snapshot(connection)
        return evaluate_supabase_rehearsal_target_snapshot(
            snapshot,
            connection_mode=connection_mode,
            target_project_ref=expected_project_ref.strip().lower(),
        )
    finally:
        try:
            connection.rollback()
        finally:
            connection.close()


def _exact_mapping_keys(value: Any, keys: Sequence[str]) -> bool:
    return isinstance(value, Mapping) and set(value) == set(keys)


def _rehearsal_metadata_digest(inventory: Any) -> str | None:
    if not (
        isinstance(inventory, Mapping)
        and set(inventory) == set(REHEARSAL_METADATA_INVENTORY_KEYS)
        and all(isinstance(inventory.get(key), list) for key in REHEARSAL_METADATA_INVENTORY_KEYS)
    ):
        return None
    return "sha256:" + sha256(
        json.dumps(
            inventory,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


def parse_rehearsal_atomic_payload(raw_payload: bytes) -> dict[str, Any]:
    if not raw_payload or len(raw_payload) > 32 * 1024 * 1024:
        raise AuditConfigurationError("atomic_apply_payload_invalid")
    try:
        payload = json.loads(raw_payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AuditConfigurationError("atomic_apply_payload_invalid") from exc
    if not _exact_mapping_keys(
        payload,
        (
            "contract",
            "targetProjectRef",
            "productionProjectRef",
            "expectedMetadataInventory",
            "expectedMetadataDigest",
            "atomicBundleDigest",
            "units",
        ),
    ) or payload.get("contract") != REHEARSAL_ATOMIC_APPLY_CONTRACT:
        raise AuditConfigurationError("atomic_apply_payload_invalid")
    inventory = payload.get("expectedMetadataInventory")
    expected_digest = _rehearsal_metadata_digest(inventory)
    if expected_digest is None or payload.get("expectedMetadataDigest") != expected_digest:
        raise AuditConfigurationError("atomic_apply_metadata_invalid")
    units = payload.get("units")
    if not isinstance(units, list) or len(units) != len(REHEARSAL_ATOMIC_UNIT_NAMES):
        raise AuditConfigurationError("atomic_apply_units_invalid")
    normalized_units: list[dict[str, Any]] = []
    for expected_name, unit in zip(REHEARSAL_ATOMIC_UNIT_NAMES, units, strict=True):
        if not _exact_mapping_keys(unit, ("name", "sourceDigest", "innerDigest", "sqlBase64")):
            raise AuditConfigurationError("atomic_apply_units_invalid")
        if unit.get("name") != expected_name:
            raise AuditConfigurationError("atomic_apply_units_invalid")
        source_digest = unit.get("sourceDigest")
        inner_digest = unit.get("innerDigest")
        encoded = unit.get("sqlBase64")
        if not (
            isinstance(source_digest, str)
            and re.fullmatch(r"sha256:[0-9a-f]{64}", source_digest)
            and isinstance(inner_digest, str)
            and re.fullmatch(r"sha256:[0-9a-f]{64}", inner_digest)
            and isinstance(encoded, str)
        ):
            raise AuditConfigurationError("atomic_apply_units_invalid")
        try:
            sql_bytes = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise AuditConfigurationError("atomic_apply_units_invalid") from exc
        if not sql_bytes or len(sql_bytes) > 4 * 1024 * 1024:
            raise AuditConfigurationError("atomic_apply_units_invalid")
        if "sha256:" + sha256(sql_bytes).hexdigest() != inner_digest:
            raise AuditConfigurationError("atomic_apply_units_invalid")
        try:
            sql_text = sql_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AuditConfigurationError("atomic_apply_units_invalid") from exc
        normalized_units.append(
            {
                "name": expected_name,
                "sourceDigest": source_digest,
                "innerDigest": inner_digest,
                "sqlBase64": encoded,
                "sqlText": sql_text,
            }
        )
    bundle_projection = [
        {
            "name": unit["name"],
            "sourceDigest": unit["sourceDigest"],
            "innerDigest": unit["innerDigest"],
            "sqlBase64": unit["sqlBase64"],
        }
        for unit in normalized_units
    ]
    bundle_digest = "sha256:" + sha256(
        json.dumps(
            {
                "contract": "supermega.preview-rehearsal-atomic-bundle.v1",
                "units": bundle_projection,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    if payload.get("atomicBundleDigest") != bundle_digest:
        raise AuditConfigurationError("atomic_apply_bundle_digest_invalid")
    return {**payload, "units": normalized_units}


def apply_supabase_rehearsal_atomically(
    database_url: str,
    *,
    expected_project_ref: str,
    production_project_ref: str,
    ssl_root_cert_path: str,
    payload: Mapping[str, Any],
    connect_factory: Any = None,
) -> dict[str, Any]:
    connection_mode = validate_supabase_rehearsal_target(
        database_url,
        expected_project_ref=expected_project_ref,
        production_project_ref=production_project_ref,
    )
    if (
        payload.get("targetProjectRef") != expected_project_ref.strip().lower()
        or payload.get("productionProjectRef") != production_project_ref.strip().lower()
    ):
        raise AuditConfigurationError("atomic_apply_target_mismatch")
    resolved_ssl_root_cert = validate_ssl_root_certificate(ssl_root_cert_path)
    connection = (
        connect_factory or _open_supabase_rehearsal_mutation_connection
    )(database_url, resolved_ssl_root_cert)
    attempted_units = 0
    committed = False
    try:
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute("begin isolation level serializable")
            cursor.execute("set local search_path = pg_catalog")
            snapshot = collect_supabase_rehearsal_target_snapshot(
                connection,
                force_read_only=False,
            )
            expected_inventory = payload["expectedMetadataInventory"]
            observed_inventory = snapshot.get("metadata_inventory")
            if isinstance(observed_inventory, str):
                observed_inventory = json.loads(observed_inventory)
            observed_digest = _rehearsal_metadata_digest(observed_inventory)
            safety_snapshot = dict(snapshot)
            # The same serializable transaction must now write. Reuse the
            # read-only preflight policy for every other clean-target control.
            safety_snapshot["transaction_read_only"] = True
            guard = evaluate_supabase_rehearsal_target_snapshot(
                safety_snapshot,
                connection_mode=connection_mode,
                target_project_ref=expected_project_ref.strip().lower(),
            )
            if (
                guard.get("ready") is not True
                or observed_inventory != expected_inventory
                or observed_digest != payload.get("expectedMetadataDigest")
            ):
                raise AuditConfigurationError("atomic_apply_clean_target_changed")
            for unit in payload["units"]:
                attempted_units += 1
                cursor.execute(unit["sqlText"])
            cursor.execute("commit")
            committed = True
        return {
            "contract": REHEARSAL_ATOMIC_APPLY_CONTRACT,
            "ok": True,
            "targetProjectRef": expected_project_ref.strip().lower(),
            "connectionMode": connection_mode,
            "metadataFingerprintBefore": observed_digest,
            "atomicBundleDigest": payload["atomicBundleDigest"],
            "appliedUnits": [
                {
                    "name": unit["name"],
                    "sourceDigest": unit["sourceDigest"],
                    "innerDigest": unit["innerDigest"],
                }
                for unit in payload["units"]
            ],
            "mutationUnitsExecuted": attempted_units,
            "transactionCommitted": True,
            "transactionRolledBack": False,
            "secretValuesExposed": False,
            "productionMutated": False,
            "vercelMutated": False,
        }
    except Exception:
        if not committed:
            try:
                connection.rollback()
            except Exception:
                pass
        raise
    finally:
        connection.close()


def _execute_rows(cursor: Any, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    cursor.execute(query, params)
    return [_mapping(row) for row in cursor.fetchall()]


def collect_snapshot(connection: Any) -> dict[str, Any]:
    """Collect only catalog evidence inside a transaction forced read-only."""

    with connection.cursor() as cursor:
        cursor.execute("set transaction read only")

        cursor.execute(
            """
            select current_setting('server_version_num')::integer as server_version_num
            """
        )
        engine = _mapping(cursor.fetchone())

        extensions = _execute_rows(
            cursor,
            """
            select extname as extension_name,
                   extversion as extension_version
            from pg_extension
            order by extname
            """,
        )

        cursor.execute(
            """
            with current_login as (
              select * from pg_roles where rolname = current_user
            ), backend as (
              select * from pg_roles where rolname = 'supermega_trial_backend'
            ), elevated as (
              select *
              from pg_roles
              where rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
                 or rolname in (
                   'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
                   'pg_read_server_files', 'pg_write_server_files'
                 )
            )
            select
              current_setting('transaction_read_only') = 'on' as transaction_read_only,
              coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as tls_active,
              current_user = session_user as session_role_stable,
              current_user <> 'supermega_trial_backend'
                and current_user not in (
                  'postgres', 'supabase_admin', 'service_role', 'authenticator', 'anon', 'authenticated'
                ) as dedicated_login,
              coalesce((select rolcanlogin from current_login), false) as can_login,
              coalesce((select not rolsuper from current_login), false) as no_superuser,
              coalesce((select not rolbypassrls from current_login), false) as no_bypassrls,
              coalesce((select not rolcreaterole from current_login), false) as no_create_role,
              coalesce((select not rolcreatedb from current_login), false) as no_create_db,
              coalesce((select not rolreplication from current_login), false) as no_replication,
              not exists (
                select 1
                from current_login
                join pg_shdepend dependency
                  on dependency.refclassid = 'pg_authid'::regclass
                 and dependency.refobjid = current_login.oid
                 and dependency.deptype in ('a', 'o')
              ) as no_direct_acl_or_ownership,
              not exists (
                select 1
                from current_login
                join pg_auth_members membership
                  on membership.roleid = current_login.oid
              ) as no_runtime_role_members,
              coalesce((
                select pg_has_role(current_login.oid, backend.oid, 'USAGE')
                from current_login cross join backend
              ), false) as inherits_backend,
              not exists (
                select 1
                from current_login cross join elevated
                where current_login.oid <> elevated.oid
                  and pg_has_role(current_login.oid, elevated.oid, 'USAGE')
              ) as no_elevated_membership
            """
        )
        identity = _mapping(cursor.fetchone())

        cursor.execute(
            """
            with backend as (
              select * from pg_roles where rolname = 'supermega_trial_backend'
            ), elevated as (
              select *
              from pg_roles
              where rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
                 or rolname in (
                   'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
                   'pg_read_server_files', 'pg_write_server_files'
                 )
            )
            select
              exists(select 1 from backend) as role_exists,
              coalesce((select not rolcanlogin from backend), false) as no_login,
              coalesce((select not rolsuper from backend), false) as no_superuser,
              coalesce((select not rolbypassrls from backend), false) as no_bypassrls,
              coalesce((select not rolcreaterole from backend), false) as no_create_role,
              coalesce((select not rolcreatedb from backend), false) as no_create_db,
              coalesce((select not rolreplication from backend), false) as no_replication,
              not exists (
                select 1
                from backend
                join pg_auth_members membership on membership.member = backend.oid
              ) as no_parent_membership,
              not exists (
                select 1
                from backend cross join elevated
                where backend.oid <> elevated.oid
                  and pg_has_role(backend.oid, elevated.oid, 'USAGE')
              ) as no_elevated_membership,
              not exists (
                select 1
                from backend
                join pg_shdepend dependency
                  on dependency.refclassid = 'pg_authid'::regclass
                 and dependency.refobjid = backend.oid
                 and dependency.deptype = 'o'
              ) as no_object_ownership
            """
        )
        backend_role = _mapping(cursor.fetchone())
        backend_acl_dependencies = _execute_rows(
            cursor,
            """
            select
              case
                when dependency.classid = 'pg_namespace'::regclass then 'schema'
                when dependency.classid = 'pg_class'::regclass then 'relation'
                when dependency.classid = 'pg_proc'::regclass then 'function'
                else 'unexpected:' || dependency.classid::regclass::text
              end as object_kind,
              case
                when dependency.classid = 'pg_namespace'::regclass
                  then schema_record.nspname
                when dependency.classid = 'pg_class'::regclass
                  then relation_schema.nspname || '.' || relation_record.relname
                when dependency.classid = 'pg_proc'::regclass
                  then function_schema.nspname || '.' || function_record.proname
                    || '(' || pg_get_function_identity_arguments(function_record.oid) || ')'
                else dependency.objid::text
              end as object_name,
              dependency.objsubid
            from pg_roles backend_role
            join pg_shdepend dependency
              on dependency.refclassid = 'pg_authid'::regclass
             and dependency.refobjid = backend_role.oid
             and dependency.deptype = 'a'
            left join pg_namespace schema_record
              on dependency.classid = 'pg_namespace'::regclass
             and schema_record.oid = dependency.objid
            left join pg_class relation_record
              on dependency.classid = 'pg_class'::regclass
             and relation_record.oid = dependency.objid
            left join pg_namespace relation_schema
              on relation_schema.oid = relation_record.relnamespace
            left join pg_proc function_record
              on dependency.classid = 'pg_proc'::regclass
             and function_record.oid = dependency.objid
            left join pg_namespace function_schema
              on function_schema.oid = function_record.pronamespace
            where backend_role.rolname = 'supermega_trial_backend'
            order by object_kind, object_name, dependency.objsubid
            """,
        )

        cursor.execute(
            """
            select
              exists(select 1 from pg_namespace where nspname = 'app_private') as schema_exists,
              coalesce((
                select owner_role.rolname
                from pg_namespace schema_record
                join pg_roles owner_role on owner_role.oid = schema_record.nspowner
                where schema_record.nspname = 'app_private'
              ), '') as owner_name
            """
        )
        schema = _mapping(cursor.fetchone())

        tables = _execute_rows(
            cursor,
            """
            select
              c.relname as table_name,
              c.relkind::text as relation_kind,
              c.relrowsecurity as rls_enabled,
              c.relforcerowsecurity as rls_forced,
              owner_role.rolname as owner_name
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            join pg_roles owner_role on owner_role.oid = c.relowner
            where n.nspname = 'app_private'
              and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
            order by c.relname
            """,
        )

        schema_version = None
        if "trial_schema_meta" in {str(row.get("table_name")) for row in tables}:
            cursor.execute(
                """
                select schema_version
                from app_private.trial_schema_meta
                where component = %s
                """,
                (SCHEMA_COMPONENT,),
            )
            version_row = cursor.fetchone()
            if version_row:
                schema_version = _mapping(version_row).get("schema_version")

        policies = _execute_rows(
            cursor,
            """
            select tablename as table_name, policyname as policy_name, permissive,
                   roles, cmd as command, qual, with_check
            from pg_policies
            where schemaname = 'app_private'
            order by tablename, policyname
            """,
        )
        hardening_constraints = _execute_rows(
            cursor,
            """
            select c.relname as table_name,
                   constraint_record.conname as constraint_name,
                   constraint_record.contype as constraint_type,
                   constraint_record.convalidated as validated,
                   pg_get_constraintdef(constraint_record.oid, true) as definition
            from pg_constraint constraint_record
            join pg_class c on c.oid = constraint_record.conrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app_private'
              and constraint_record.conname = any(%s)
            order by constraint_record.conname
            """,
            (list(EXPECTED_SECURITY_CONSTRAINTS),),
        )
        triggers = _execute_rows(
            cursor,
            """
            select c.relname as table_name, t.tgname as trigger_name,
                   p.proname as function_name, t.tgenabled as enabled,
                   t.tgtype::integer as trigger_type,
                   pg_get_triggerdef(t.oid, true) as definition,
                   t.tgqual is null as no_when_clause,
                   t.tgnargs = 0 as no_arguments,
                   cardinality(t.tgattr::int2[]) = 0 as no_column_filter,
                   t.tgconstraint = 0 as no_constraint_link,
                   not t.tgdeferrable as not_deferrable,
                   not t.tginitdeferred as not_initially_deferred,
                   t.tgoldtable is null and t.tgnewtable is null as no_transition_tables,
                   p.prosrc as function_source,
                   owner_role.rolname as owner_name,
                   p.prosecdef as security_definer,
                   p.proconfig as function_config,
                   language_record.lanname as function_language
            from pg_trigger t
            join pg_class c on c.oid = t.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
            join pg_proc p on p.oid = t.tgfoid
            join pg_roles owner_role on owner_role.oid = p.proowner
            join pg_language language_record on language_record.oid = p.prolang
            where n.nspname = 'app_private' and not t.tgisinternal
            order by c.relname, t.tgname
            """,
        )
        functions = _execute_rows(
            cursor,
            """
            select function_record.proname as function_name,
                   owner_role.rolname as owner_name,
                   function_record.prokind::text as function_kind,
                   pg_get_function_identity_arguments(function_record.oid) as identity_arguments,
                   pg_get_function_result(function_record.oid) as result_type,
                   function_record.prosrc as function_source,
                   function_record.prosecdef as security_definer,
                   function_record.provolatile as volatility,
                   function_record.proconfig as function_config,
                   language_record.lanname as function_language
            from pg_proc function_record
            join pg_namespace schema_record
              on schema_record.oid = function_record.pronamespace
            join pg_roles owner_role on owner_role.oid = function_record.proowner
            join pg_language language_record on language_record.oid = function_record.prolang
            where schema_record.nspname = 'app_private'
            order by function_record.proname, function_record.oid
            """,
        )
        indexes = _execute_rows(
            cursor,
            """
            select table_record.relname as table_name,
                   index_record.relname as index_name,
                   access_method.amname as access_method,
                   index_catalog.indisunique as is_unique,
                   index_catalog.indisprimary as is_primary,
                   index_catalog.indisvalid as is_valid,
                   index_catalog.indisready as is_ready,
                   index_catalog.indislive as is_live,
                   index_catalog.indimmediate as is_immediate,
                   not index_catalog.indisexclusion as not_exclusion,
                   index_catalog.indnatts = index_catalog.indnkeyatts as no_included_columns,
                   not index_catalog.indnullsnotdistinct as nulls_distinct,
                   index_catalog.indpred is null as no_predicate,
                   index_catalog.indexprs is null as no_expressions,
                   array(
                     select pg_get_indexdef(
                       index_catalog.indexrelid,
                       key_position,
                       true
                     )
                     from generate_series(1, index_catalog.indnkeyatts) key_position
                     order by key_position
                   ) as key_columns,
                   index_catalog.indoption::int2[] as key_options,
                   constraint_record.contype::text as constraint_type
            from pg_index index_catalog
            join pg_class index_record on index_record.oid = index_catalog.indexrelid
            join pg_class table_record on table_record.oid = index_catalog.indrelid
            join pg_namespace schema_record on schema_record.oid = table_record.relnamespace
            join pg_am access_method on access_method.oid = index_record.relam
            left join pg_constraint constraint_record
              on constraint_record.conindid = index_catalog.indexrelid
            where schema_record.nspname = 'app_private'
            order by table_record.relname, index_record.relname
            """,
        )
        acl_entries = _execute_rows(
            cursor,
            """
            with acl_rows as (
              select 'schema'::text as object_kind, n.nspname as object_name,
                     n.nspowner as object_owner, acl.grantee, acl.privilege_type,
                     acl.is_grantable
              from pg_namespace n
              cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
              where n.nspname = 'app_private'
              union all
              select case
                       when c.relkind = 'S' then 'sequence'
                       when c.relkind = 'v' then 'view'
                       when c.relkind = 'm' then 'materialized_view'
                       when c.relkind = 'f' then 'foreign_table'
                       else 'table'
                     end,
                     c.relname, c.relowner, acl.grantee, acl.privilege_type,
                     acl.is_grantable
              from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              cross join lateral aclexplode(
                coalesce(
                  c.relacl,
                  acldefault(
                    case when c.relkind = 'S' then 'S'::"char" else 'r'::"char" end,
                    c.relowner
                  )
                )
              ) acl
              where n.nspname = 'app_private'
                and c.relkind in ('r', 'p', 'S', 'v', 'm', 'f')
              union all
              select 'function', p.proname, p.proowner, acl.grantee, acl.privilege_type,
                     acl.is_grantable
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
              where n.nspname = 'app_private'
            )
            select acl_rows.object_kind, acl_rows.object_name,
                   coalesce(grantee.rolname, 'PUBLIC') as grantee,
                   acl_rows.privilege_type, acl_rows.is_grantable
            from acl_rows
            left join pg_roles grantee on grantee.oid = acl_rows.grantee
            where acl_rows.grantee <> acl_rows.object_owner
            order by acl_rows.object_kind, acl_rows.object_name, grantee, acl_rows.privilege_type
            """,
        )
        default_acl_entries = _execute_rows(
            cursor,
            """
            select owner_role.rolname as owner_name,
                   coalesce(schema_record.nspname, 'GLOBAL') as schema_name,
                   default_acl.defaclobjtype::text as object_type,
                   coalesce(grantee_role.rolname, 'PUBLIC') as grantee,
                   acl.privilege_type,
                   acl.is_grantable
            from pg_default_acl default_acl
            join pg_roles owner_role on owner_role.oid = default_acl.defaclrole
            left join pg_namespace schema_record
              on schema_record.oid = default_acl.defaclnamespace
            cross join lateral aclexplode(default_acl.defaclacl) acl
            left join pg_roles grantee_role on grantee_role.oid = acl.grantee
            where (
                default_acl.defaclnamespace = 0
                or schema_record.nspname = 'app_private'
              )
              and acl.grantee <> default_acl.defaclrole
            order by owner_role.rolname, default_acl.defaclobjtype,
                     grantee_role.rolname, acl.privilege_type
            """,
        )
        browser_roles = _execute_rows(
            cursor,
            """
            with backend as (select oid from pg_roles where rolname = 'supermega_trial_backend')
            select browser.rolname as role_name,
                   coalesce((
                     select pg_has_role(browser.oid, backend.oid, 'USAGE') from backend
                   ), false) as inherits_backend
            from pg_roles browser
            where browser.rolname in ('anon', 'authenticated', 'service_role')
            order by browser.rolname
            """,
        )
        runtime_parent_memberships = _execute_rows(
            cursor,
            """
            select parent_role.rolname as parent_role,
                   membership.admin_option,
                   membership.inherit_option,
                   membership.set_option
            from pg_roles runtime_role
            join pg_auth_members membership on membership.member = runtime_role.oid
            join pg_roles parent_role on parent_role.oid = membership.roleid
            where runtime_role.rolname = current_user
            order by parent_role.rolname
            """,
        )
        backend_members = _execute_rows(
            cursor,
            """
            select member_role.rolname as member_role,
                   grantor_role.rolname as grantor_role,
                   member_role.rolname = current_user as is_current_runtime,
                   membership.admin_option,
                   membership.inherit_option,
                   membership.set_option
            from pg_roles backend_role
            join pg_auth_members membership on membership.roleid = backend_role.oid
            join pg_roles member_role on member_role.oid = membership.member
            join pg_roles grantor_role on grantor_role.oid = membership.grantor
            where backend_role.rolname = 'supermega_trial_backend'
            order by member_role.rolname
            """,
        )
        role_settings = _execute_rows(
            cursor,
            """
            select role_record.rolname as role_name,
                   count(*)::integer as setting_count
            from pg_db_role_setting setting
            join pg_roles role_record on role_record.oid = setting.setrole
            where role_record.rolname in (current_user, 'supermega_trial_backend')
            group by role_record.rolname
            order by role_record.rolname
            """,
        )

    return {
        "engine": engine,
        "extensions": extensions,
        "identity": identity,
        "backend_role": backend_role,
        "backend_acl_dependencies": backend_acl_dependencies,
        "schema": schema,
        "schema_version": schema_version,
        "tables": tables,
        "policies": policies,
        "hardening_constraints": hardening_constraints,
        "triggers": triggers,
        "functions": functions,
        "indexes": indexes,
        "acl_entries": acl_entries,
        "default_acl_entries": default_acl_entries,
        "browser_roles": browser_roles,
        "runtime_parent_memberships": runtime_parent_memberships,
        "backend_members": backend_members,
        "role_settings": role_settings,
    }


def collect_storage_snapshot(connection: Any) -> dict[str, Any]:
    """Collect Storage posture through a separate read-only audit connection."""

    with connection.cursor() as cursor:
        cursor.execute("set transaction read only")
        cursor.execute(
            """
            select
              current_setting('transaction_read_only') = 'on'
                as storage_audit_transaction_read_only,
              coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false)
                as storage_audit_tls_active
            """
        )
        storage_audit_connection = _mapping(cursor.fetchone())
        cursor.execute(
            """
            select
              to_regclass('storage.buckets') is not null as buckets_table_exists,
              to_regclass('storage.objects') is not null as objects_table_exists,
              coalesce((
                select table_record.relrowsecurity
                from pg_class table_record
                join pg_namespace schema_record
                  on schema_record.oid = table_record.relnamespace
                where schema_record.nspname = 'storage'
                  and table_record.relname = 'buckets'
                  and table_record.relkind in ('r', 'p')
              ), false) as buckets_rls_enabled,
              coalesce((
                select table_record.relrowsecurity
                from pg_class table_record
                join pg_namespace schema_record
                  on schema_record.oid = table_record.relnamespace
                where schema_record.nspname = 'storage'
                  and table_record.relname = 'objects'
                  and table_record.relkind in ('r', 'p')
              ), false) as objects_rls_enabled,
              coalesce(
                has_table_privilege(
                  current_user,
                  to_regclass('storage.buckets'),
                  'SELECT'
                ),
                false
              ) as bucket_inventory_readable
            """
        )
        storage_catalog = _mapping(cursor.fetchone())
        storage_bucket_inventory: dict[str, Any] = {}
        if _bool(storage_catalog.get("bucket_inventory_readable")):
            cursor.execute(
                """
                select count(*)::integer as bucket_count,
                       count(*) filter (where public is true)::integer
                         as public_bucket_count
                from storage.buckets
                """
            )
            storage_bucket_inventory = _mapping(cursor.fetchone())
        storage_policies = _execute_rows(
            cursor,
            """
            select tablename as table_name, policyname as policy_name, permissive,
                   roles, cmd as command, qual, with_check
            from pg_policies
            where schemaname = 'storage'
              and tablename in ('buckets', 'objects')
            order by tablename, policyname
            """,
        )

    return {
        "storage_audit_connection": storage_audit_connection,
        "storage_catalog": storage_catalog,
        "storage_bucket_inventory": storage_bucket_inventory,
        "storage_policies": storage_policies,
    }


def evaluate_snapshot(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    engine = _mapping(snapshot.get("engine", {}))
    identity = _mapping(snapshot.get("identity", {}))
    backend = _mapping(snapshot.get("backend_role", {}))
    backend_acl_dependency_rows = [
        _mapping(row) for row in snapshot.get("backend_acl_dependencies", [])
    ]
    schema = _mapping(snapshot.get("schema", {}))
    table_rows = [_mapping(row) for row in snapshot.get("tables", [])]
    policy_rows = [_mapping(row) for row in snapshot.get("policies", [])]
    storage_audit_connection = _mapping(snapshot.get("storage_audit_connection", {}))
    storage_catalog = _mapping(snapshot.get("storage_catalog", {}))
    storage_bucket_inventory = _mapping(snapshot.get("storage_bucket_inventory", {}))
    storage_policy_rows = [_mapping(row) for row in snapshot.get("storage_policies", [])]
    hardening_constraint_rows = [
        _mapping(row) for row in snapshot.get("hardening_constraints", [])
    ]
    trigger_rows = [_mapping(row) for row in snapshot.get("triggers", [])]
    function_rows = [_mapping(row) for row in snapshot.get("functions", [])]
    index_rows = [_mapping(row) for row in snapshot.get("indexes", [])]
    acl_rows = [_mapping(row) for row in snapshot.get("acl_entries", [])]
    default_acl_rows = [_mapping(row) for row in snapshot.get("default_acl_entries", [])]
    browser_rows = [_mapping(row) for row in snapshot.get("browser_roles", [])]
    runtime_parent_rows = [
        _mapping(row) for row in snapshot.get("runtime_parent_memberships", [])
    ]
    backend_member_rows = [_mapping(row) for row in snapshot.get("backend_members", [])]
    role_setting_rows = [_mapping(row) for row in snapshot.get("role_settings", [])]
    extension_rows = [_mapping(row) for row in snapshot.get("extensions", [])]
    unsupported_extensions = _unsupported_postgres17_extensions(extension_rows)

    try:
        server_version_num = int(engine.get("server_version_num", 0))
    except (TypeError, ValueError):
        server_version_num = 0
    postgres_major = server_version_num // 10_000 if server_version_num > 0 else 0
    try:
        role_setting_count = sum(
            max(0, int(row.get("setting_count", 0))) for row in role_setting_rows
        )
    except (TypeError, ValueError):
        role_setting_count = -1

    connection_keys = (
        "transaction_read_only",
        "tls_active",
        "session_role_stable",
        "dedicated_login",
        "can_login",
        "no_superuser",
        "no_bypassrls",
        "no_create_role",
        "no_create_db",
        "no_replication",
        "no_direct_acl_or_ownership",
        "no_runtime_role_members",
        "inherits_backend",
        "no_elevated_membership",
    )
    backend_keys = (
        "role_exists",
        "no_login",
        "no_superuser",
        "no_bypassrls",
        "no_create_role",
        "no_create_db",
        "no_replication",
        "no_parent_membership",
        "no_elevated_membership",
        "no_object_ownership",
    )

    tables = {str(row.get("table_name")): row for row in table_rows}
    exact_tables = (
        len(table_rows) == len(EXPECTED_TABLES)
        and frozenset(tables) == EXPECTED_TABLES
        and all(str(tables[name].get("relation_kind")) == "r" for name in EXPECTED_TABLES)
    )
    tenant_rls = exact_tables and all(
        _bool(tables[name].get("rls_enabled")) and _bool(tables[name].get("rls_forced"))
        for name in TENANT_TABLES
    )
    metadata_rls = (
        exact_tables
        and _bool(tables["trial_schema_meta"].get("rls_enabled"))
        and not _bool(tables["trial_schema_meta"].get("rls_forced"))
    )
    storage_catalog_present = all(
        _bool(storage_catalog.get(key))
        for key in ("buckets_table_exists", "objects_table_exists")
    )
    storage_rls_enabled = storage_catalog_present and all(
        _bool(storage_catalog.get(key))
        for key in ("buckets_rls_enabled", "objects_rls_enabled")
    )
    storage_bucket_count = _nonnegative_int(storage_bucket_inventory.get("bucket_count"))
    public_bucket_count = _nonnegative_int(
        storage_bucket_inventory.get("public_bucket_count")
    )
    storage_bucket_inventory_readable = (
        _bool(storage_catalog.get("bucket_inventory_readable"))
        and storage_bucket_count is not None
        and public_bucket_count is not None
        and public_bucket_count <= storage_bucket_count
    )
    storage_public_buckets_absent = (
        storage_bucket_inventory_readable and public_bucket_count == 0
    )
    storage_policy_surface_empty = not storage_policy_rows
    storage_audit_connection_safe = all(
        _bool(storage_audit_connection.get(key))
        for key in (
            "storage_audit_transaction_read_only",
            "storage_audit_tls_active",
        )
    )
    functions = {str(row.get("function_name")): row for row in function_rows}
    exact_functions = (
        len(function_rows) == len(EXPECTED_FUNCTIONS)
        and frozenset(functions) == frozenset(EXPECTED_FUNCTIONS)
        and all(
            str(functions[name].get("owner_name")) == TRUSTED_OWNER
            and str(functions[name].get("function_kind")) == "f"
            and str(functions[name].get("identity_arguments", "")) == expected[0]
            and str(functions[name].get("result_type", "")).lower() == expected[1]
            for name, expected in EXPECTED_FUNCTIONS.items()
        )
        and str(functions["workspace_is_active"].get("function_language")) == "sql"
        and functions["workspace_is_active"].get("security_definer") is False
        and _ordered_texts(functions["workspace_is_active"].get("function_config"))
        == ("search_path=pg_catalog, app_private",)
        and _catalog_expression_fingerprint(
            functions["workspace_is_active"].get("function_source")
        )
        == WORKSPACE_ACCESS_FUNCTION_FINGERPRINT
        and str(functions["actor_workspace_directory"].get("function_language")) == "sql"
        and functions["actor_workspace_directory"].get("security_definer") is True
        and _ordered_texts(functions["actor_workspace_directory"].get("function_config"))
        == ("search_path=pg_catalog, app_private",)
        and _catalog_expression_fingerprint(
            functions["actor_workspace_directory"].get("function_source")
        )
        == WORKSPACE_DIRECTORY_FUNCTION_FINGERPRINT
        and str(functions["supabase_session_is_active"].get("function_language")) == "sql"
        and functions["supabase_session_is_active"].get("security_definer") is True
        and str(functions["supabase_session_is_active"].get("volatility")) == "s"
        and _ordered_texts(functions["supabase_session_is_active"].get("function_config"))
        == ('search_path=""',)
        and _catalog_expression_fingerprint(
            functions["supabase_session_is_active"].get("function_source")
        )
        == SUPABASE_SESSION_FUNCTION_FINGERPRINT
    )
    trusted_private_ownership = (
        str(schema.get("owner_name")) == TRUSTED_OWNER
        and exact_tables
        and all(str(row.get("owner_name")) == TRUSTED_OWNER for row in table_rows)
        and exact_functions
    )

    policies = {str(row.get("policy_name")): row for row in policy_rows}
    policy_contract = (
        len(policy_rows) == len(EXPECTED_POLICIES)
        and frozenset(policies) == frozenset(EXPECTED_POLICIES)
    )
    if policy_contract:
        for name, expected in EXPECTED_POLICIES.items():
            row = policies[name]
            fingerprints = EXPECTED_POLICY_FINGERPRINTS[name]
            policy_contract = policy_contract and (
                str(row.get("table_name")) == expected["table"]
                and str(row.get("command", "")).upper() == expected["command"]
                and str(row.get("permissive", "")).upper()
                == expected["permissive"]
                and _roles(row.get("roles")) == {BACKEND_ROLE}
                and _policy_expression_matches(row.get("qual"), fingerprints["qual"])
                and _policy_expression_matches(row.get("with_check"), fingerprints["check"])
            )
            if not policy_contract:
                break

    constraints = {
        str(row.get("constraint_name")): row for row in hardening_constraint_rows
    }
    security_constraints_exact = (
        len(hardening_constraint_rows) == len(EXPECTED_SECURITY_CONSTRAINTS)
        and frozenset(constraints) == frozenset(EXPECTED_SECURITY_CONSTRAINTS)
    )
    if security_constraints_exact:
        for name, expected in EXPECTED_SECURITY_CONSTRAINTS.items():
            row = constraints[name]
            security_constraints_exact = security_constraints_exact and (
                str(row.get("table_name")) == expected["table"]
                and str(row.get("constraint_type")) == "c"
                and row.get("validated") is True
                and _catalog_expression_fingerprint(row.get("definition"))
                == expected["sha256"]
            )
            if not security_constraints_exact:
                break

    triggers = {str(row.get("trigger_name")): row for row in trigger_rows}
    trigger_contract = frozenset(triggers) == frozenset(EXPECTED_TRIGGERS)
    if trigger_contract:
        for name, expected in EXPECTED_TRIGGERS.items():
            row = triggers[name]
            trigger_contract = trigger_contract and (
                str(row.get("table_name")) == expected["table"]
                and str(row.get("function_name")) == expected["function"]
                and str(row.get("owner_name")) == TRUSTED_OWNER
                and str(row.get("enabled")) in {"O", "A"}
                and int(row.get("trigger_type", -1)) == expected["trigger_type"]
                and _bool(row.get("no_when_clause"))
                and _bool(row.get("no_arguments"))
                and _bool(row.get("no_column_filter"))
                and _bool(row.get("no_constraint_link"))
                and _bool(row.get("not_deferrable"))
                and _bool(row.get("not_initially_deferred"))
                and _bool(row.get("no_transition_tables"))
                and str(row.get("function_language", "")).lower() == "plpgsql"
                and row.get("security_definer") is False
                and _function_settings(row.get("function_config"))
                == {"search_path=pg_catalog, app_private"}
                and _normalized_function_source(row.get("function_source"))
                == _normalized_function_source(expected["function_source"])
            )
            if not trigger_contract:
                break

    indexes = {str(row.get("index_name")): row for row in index_rows}
    index_contract = (
        len(index_rows) == len(EXPECTED_INDEX_CONTRACT)
        and frozenset(indexes) == EXPECTED_INDEXES
    )
    if index_contract:
        for name, expected in EXPECTED_INDEX_CONTRACT.items():
            row = indexes[name]
            observed_constraint = row.get("constraint_type")
            if observed_constraint in ("", None):
                observed_constraint = None
            index_contract = index_contract and (
                str(row.get("table_name")) == expected["table"]
                and str(row.get("access_method", "")).lower() == "btree"
                and row.get("is_unique") is expected["unique"]
                and row.get("is_primary") is expected["primary"]
                and _bool(row.get("is_valid"))
                and _bool(row.get("is_ready"))
                and _bool(row.get("is_live"))
                and _bool(row.get("is_immediate"))
                and _bool(row.get("not_exclusion"))
                and _bool(row.get("no_included_columns"))
                and _bool(row.get("nulls_distinct"))
                and _bool(row.get("no_predicate"))
                and _bool(row.get("no_expressions"))
                and _normalized_index_keys(row.get("key_columns")) == expected["keys"]
                and _ordered_ints(row.get("key_options")) == expected["options"]
                and observed_constraint == expected["constraint"]
            )
            if not index_contract:
                break

    observed_acl = [
        (
            str(row.get("object_kind")),
            str(row.get("object_name")),
            str(row.get("grantee")),
            str(row.get("privilege_type", "")).upper(),
            row.get("is_grantable") is True,
        )
        for row in acl_rows
    ]
    acl_contract = (
        len(observed_acl) == len(EXPECTED_NON_OWNER_ACL)
        and frozenset(observed_acl) == EXPECTED_NON_OWNER_ACL
    )
    observed_backend_acl_dependencies = [
        (
            str(row.get("object_kind")),
            str(row.get("object_name")),
            int(row.get("objsubid", -1)),
        )
        for row in backend_acl_dependency_rows
    ]
    backend_acl_scope_exact = (
        len(observed_backend_acl_dependencies) == len(EXPECTED_BACKEND_ACL_DEPENDENCIES)
        and frozenset(observed_backend_acl_dependencies)
        == EXPECTED_BACKEND_ACL_DEPENDENCIES
    )

    runtime_membership_exact = (
        len(runtime_parent_rows) == 1
        and str(runtime_parent_rows[0].get("parent_role")) == BACKEND_ROLE
        and _safe_runtime_membership_options(runtime_parent_rows[0])
    )
    runtime_backend_members = [
        row for row in backend_member_rows if _bool(row.get("is_current_runtime"))
    ]
    backend_membership_exact = (
        len(runtime_backend_members) == 1
        and _safe_runtime_membership_options(runtime_backend_members[0])
        and all(
            _bool(row.get("is_current_runtime")) or _safe_hosted_admin_membership(row)
            for row in backend_member_rows
        )
    )
    browser_names = frozenset(str(row.get("role_name")) for row in browser_rows)
    browser_roles_isolated = browser_names == BROWSER_ROLES and all(
        not _bool(row.get("inherits_backend")) for row in browser_rows
    )

    checks = {
        "postgres_major_supported": postgres_major == EXPECTED_POSTGRES_MAJOR,
        "supabase_postgres17_unsupported_extensions_absent": not unsupported_extensions,
        "read_only_encrypted_connection": all(
            _bool(identity.get(key)) for key in ("transaction_read_only", "tls_active")
        ),
        "dedicated_runtime_role": all(_bool(identity.get(key)) for key in connection_keys[2:]),
        "backend_group_role_safe": all(_bool(backend.get(key)) for key in backend_keys),
        "private_schema_present": _bool(schema.get("schema_exists")),
        "schema_version_current": snapshot.get("schema_version") == SCHEMA_VERSION,
        "expected_private_tables_only": exact_tables,
        "metadata_table_rls": metadata_rls,
        "tenant_tables_force_rls": tenant_rls,
        "trusted_private_object_ownership": trusted_private_ownership,
        "runtime_role_membership_exact": runtime_membership_exact,
        "backend_membership_exact": backend_membership_exact,
        "runtime_and_backend_role_settings_empty": (
            not role_setting_rows and role_setting_count == 0
        ),
        "policy_contract_exact": policy_contract,
        "security_constraints_exact": security_constraints_exact,
        "immutable_and_version_triggers_exact": trigger_contract,
        "private_indexes_exact": index_contract,
        "private_acl_exact": acl_contract,
        "backend_acl_scope_exact": backend_acl_scope_exact,
        "private_default_acl_empty": not default_acl_rows,
        "browser_roles_not_backend_members": browser_roles_isolated,
        "storage_audit_connection_read_only_encrypted": storage_audit_connection_safe,
        "storage_catalog_present": storage_catalog_present,
        "storage_tables_rls_enabled": storage_rls_enabled,
        "storage_bucket_inventory_readable": storage_bucket_inventory_readable,
        "storage_public_buckets_absent": storage_public_buckets_absent,
        "storage_policy_surface_empty_until_allowlisted": storage_policy_surface_empty,
    }
    failed = [name for name, passed in checks.items() if not passed]
    return {
        "ok": not failed,
        "ready": not failed,
        "status": "ready" if not failed else "attention",
        "contract": CONTRACT,
        "checks": checks,
        "failed_checks": failed,
        "evidence": {
            "engine": {
                "postgres_major": postgres_major,
                "installed_extensions": sorted(
                    str(row.get("extension_name", "")).strip().lower()
                    for row in extension_rows
                    if str(row.get("extension_name", "")).strip()
                ),
                "unsupported_extensions": unsupported_extensions,
            },
            "schema": {
                "name": SCHEMA,
                "component": SCHEMA_COMPONENT,
                "version": snapshot.get("schema_version"),
            },
            "role": {
                "backend_group": BACKEND_ROLE,
                "dedicated_login_verified": checks["dedicated_runtime_role"],
                "settings_entries": role_setting_count,
            },
            "tables": sorted(EXPECTED_TABLES),
            "rls": {
                "metadata_table": {
                    "enabled": _bool(
                        tables.get("trial_schema_meta", {}).get("rls_enabled")
                    ),
                    "forced": _bool(
                        tables.get("trial_schema_meta", {}).get("rls_forced")
                    ),
                },
                "forced_tables": sorted(
                    name
                    for name in TENANT_TABLES
                    if name in tables
                    and _bool(tables[name].get("rls_enabled"))
                    and _bool(tables[name].get("rls_forced"))
                ),
                "required_tables": sorted(TENANT_TABLES),
            },
            "grant": {
                "runtime_acl_entries": len(observed_acl),
                "expected_runtime_acl_entries": len(EXPECTED_NON_OWNER_ACL),
                "default_acl_entries": len(default_acl_rows),
            },
            "policies": sorted(EXPECTED_POLICIES),
            "hardening_constraints": sorted(EXPECTED_SECURITY_CONSTRAINTS),
            "triggers": sorted(EXPECTED_TRIGGERS),
            "indexes": sorted(EXPECTED_INDEXES),
            "storage": {
                "baseline": STORAGE_BASELINE,
                "tables": sorted(STORAGE_TABLES),
                "audit_connection_read_only_encrypted": storage_audit_connection_safe,
                "bucket_inventory_readable": storage_bucket_inventory_readable,
                "bucket_count": storage_bucket_count,
                "public_bucket_count": public_bucket_count,
                "policy_count": len(storage_policy_rows),
            },
        },
        "mutation_statements_executed": 0,
        "secret_values_exposed": False,
    }


def _postgres_driver() -> tuple[Any, Any]:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise RuntimeError("postgres_driver_missing") from exc
    return psycopg, dict_row


def _open_connection(database_url: str) -> Any:
    psycopg, dict_row = _postgres_driver()
    return psycopg.connect(
        database_url,
        row_factory=dict_row,
        connect_timeout=5,
        sslmode=_database_url_sslmode(database_url),
        application_name="supermega-readiness-audit",
        options="-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000",
    )


def _open_storage_audit_connection(database_url: str) -> Any:
    psycopg, dict_row = _postgres_driver()
    return psycopg.connect(
        database_url,
        row_factory=dict_row,
        connect_timeout=5,
        sslmode=_database_url_sslmode(database_url),
        application_name="supermega-storage-readiness-audit",
        options="-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000",
    )


def _open_supabase_rehearsal_connection(
    database_url: str,
    ssl_root_cert_path: str,
) -> Any:
    psycopg, dict_row = _postgres_driver()
    return psycopg.connect(
        database_url,
        row_factory=dict_row,
        connect_timeout=5,
        sslmode="verify-full",
        sslrootcert=ssl_root_cert_path,
        application_name="supermega-supabase-rehearsal-preflight",
        options="-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000",
    )


def _open_supabase_rehearsal_mutation_connection(
    database_url: str,
    ssl_root_cert_path: str,
) -> Any:
    psycopg, dict_row = _postgres_driver()
    return psycopg.connect(
        database_url,
        row_factory=dict_row,
        cursor_factory=psycopg.ClientCursor,
        connect_timeout=5,
        sslmode="verify-full",
        sslrootcert=ssl_root_cert_path,
        application_name="supermega-supabase-rehearsal-atomic-apply",
        options="-c statement_timeout=0 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=300000",
    )


def audit_database(
    database_url: str,
    *,
    storage_audit_database_url: str,
    connect_factory: Any = None,
    storage_connect_factory: Any = None,
) -> dict[str, Any]:
    validate_database_url(database_url)
    try:
        validate_database_url(storage_audit_database_url)
    except AuditConfigurationError as exc:
        raise AuditConfigurationError("storage_audit_database_url_invalid") from exc
    connection = (connect_factory or _open_connection)(database_url)
    try:
        snapshot = collect_snapshot(connection)
    finally:
        try:
            connection.rollback()
        finally:
            connection.close()
    storage_connection = (storage_connect_factory or _open_storage_audit_connection)(
        storage_audit_database_url
    )
    try:
        snapshot.update(collect_storage_snapshot(storage_connection))
    finally:
        try:
            storage_connection.rollback()
        finally:
            storage_connection.close()
    return evaluate_snapshot(snapshot)


def audit_supabase_activation_target(
    database_url: str,
    *,
    storage_audit_database_url: str,
    expected_project_ref: str,
    connect_factory: Any = None,
    storage_connect_factory: Any = None,
) -> dict[str, Any]:
    database_connection_mode = validate_supabase_activation_target(
        database_url,
        expected_project_ref=expected_project_ref,
    )
    storage_audit_connection_mode = validate_supabase_activation_target(
        storage_audit_database_url,
        expected_project_ref=expected_project_ref,
    )
    report = audit_database(
        database_url,
        storage_audit_database_url=storage_audit_database_url,
        connect_factory=connect_factory,
        storage_connect_factory=storage_connect_factory,
    )
    report.update(
        {
            "activation_contract": ACTIVATION_TARGET_CONTRACT,
            "target_project_ref": expected_project_ref.strip().lower(),
            "database_connection_mode": database_connection_mode,
            "storage_audit_connection_mode": storage_audit_connection_mode,
        }
    )
    return report


def _safe_failure(code: str, *, contract: str = CONTRACT) -> dict[str, Any]:
    report = {
        "ok": False,
        "ready": False,
        "status": "attention",
        "contract": contract,
        "error": code,
        "mutation_statements_executed": 0,
        "secret_values_exposed": False,
    }
    if contract in {
        REHEARSAL_PREFLIGHT_CONTRACT,
        REHEARSAL_ATOMIC_APPLY_CONTRACT,
        ACTIVATION_TARGET_CONTRACT,
    }:
        report.update(
            {
                "production_mutated": False,
                "supabase_mutated": False,
                "vercel_mutated": False,
            }
        )
    return report


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Audit SuperMega read-only or execute one exact isolated rehearsal transaction."
    )
    parser.add_argument("--env-key", default="SUPERMEGA_DATABASE_URL")
    parser.add_argument(
        "--storage-audit-env-key",
        default="SUPERMEGA_STORAGE_AUDIT_DATABASE_URL",
        help=(
            "Environment variable containing a separate read-only audit URL that can inspect "
            "Supabase Storage bucket metadata."
        ),
    )
    parser.add_argument(
        "--ensure-schema",
        action="store_true",
        help="Require the complete v10 schema contract; this flag never applies migrations.",
    )
    parser.add_argument("--require-ready", action="store_true")
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Exercise policy-bypass fixtures without opening a database connection.",
    )
    parser.add_argument(
        "--rehearsal-preflight",
        action="store_true",
        help="Verify one explicit clean non-production Supabase migration target without mutation.",
    )
    parser.add_argument(
        "--rehearsal-atomic-apply",
        action="store_true",
        help=(
            "Verify the owner-bound clean catalog snapshot and apply the exact migration bundle "
            "inside one serializable transaction read from stdin."
        ),
    )
    parser.add_argument(
        "--activation-target",
        action="store_true",
        help="Bind both read-only readiness URLs to one explicit Supabase project.",
    )
    parser.add_argument(
        "--evidence-output",
        default="",
        help="Write a sanitized, digest-bound JSON activation receipt to this path.",
    )
    parser.add_argument(
        "--expected-project-ref-env-key",
        default="SUPERMEGA_REHEARSAL_PROJECT_REF",
    )
    parser.add_argument(
        "--production-project-ref-env-key",
        default="SUPERMEGA_PRODUCTION_PROJECT_REF",
    )
    parser.add_argument(
        "--ssl-root-cert-env-key",
        default="SUPERMEGA_SUPABASE_CA_FILE",
    )
    args = parser.parse_args(argv)

    if args.self_test:
        report = _run_policy_self_test()
        print(json.dumps(report, sort_keys=True))
        return 0 if report["ok"] is True else 1

    mode_contract = (
        REHEARSAL_ATOMIC_APPLY_CONTRACT
        if args.rehearsal_atomic_apply
        else REHEARSAL_PREFLIGHT_CONTRACT
        if args.rehearsal_preflight
        else ACTIVATION_TARGET_CONTRACT
        if args.activation_target
        else CONTRACT
    )

    environment_keys = [args.env_key]
    if args.rehearsal_preflight or args.rehearsal_atomic_apply:
        environment_keys.extend(
            [
                args.expected_project_ref_env_key,
                args.production_project_ref_env_key,
                args.ssl_root_cert_env_key,
            ]
        )
    else:
        environment_keys.append(args.storage_audit_env_key)
        if args.activation_target:
            environment_keys.append(args.expected_project_ref_env_key)
    if not all(re.fullmatch(r"[A-Z][A-Z0-9_]{2,80}", key) for key in environment_keys):
        print(json.dumps(_safe_failure("env_key_invalid", contract=mode_contract), sort_keys=True))
        return 2
    database_url = str(os.getenv(args.env_key, "")).strip()
    if not database_url:
        print(json.dumps(_safe_failure("database_url_missing", contract=mode_contract), sort_keys=True))
        return 2
    storage_audit_database_url = ""
    if not args.rehearsal_preflight:
        storage_audit_database_url = str(
            os.getenv(args.storage_audit_env_key, "")
        ).strip()
        if not storage_audit_database_url:
            print(
                json.dumps(
                    _safe_failure(
                        "storage_audit_database_url_missing",
                        contract=mode_contract,
                    ),
                    sort_keys=True,
                )
            )
            return 2

    if (
        (args.rehearsal_preflight and args.rehearsal_atomic_apply)
        or ((args.rehearsal_preflight or args.rehearsal_atomic_apply) and args.activation_target)
    ):
        print(
            json.dumps(
                _safe_failure(
                    "target_mode_conflict",
                    contract=ACTIVATION_TARGET_CONTRACT,
                ),
                sort_keys=True,
            )
        )
        return 2

    if args.evidence_output and not args.activation_target:
        print(
            json.dumps(
                _safe_failure(
                    "activation_evidence_requires_activation_target",
                    contract=mode_contract,
                ),
                sort_keys=True,
            )
        )
        return 2

    if (args.rehearsal_preflight or args.rehearsal_atomic_apply) and (
        args.ensure_schema or args.require_ready
    ):
        print(
            json.dumps(
                _safe_failure(
                    "rehearsal_mode_conflict",
                    contract=mode_contract,
                ),
                sort_keys=True,
            )
        )
        return 2

    try:
        if args.rehearsal_atomic_apply:
            payload = parse_rehearsal_atomic_payload(sys.stdin.buffer.read(32 * 1024 * 1024 + 1))
            report = apply_supabase_rehearsal_atomically(
                database_url,
                expected_project_ref=str(
                    os.getenv(args.expected_project_ref_env_key, "")
                ),
                production_project_ref=str(
                    os.getenv(args.production_project_ref_env_key, "")
                ),
                ssl_root_cert_path=str(
                    os.getenv(args.ssl_root_cert_env_key, "")
                ),
                payload=payload,
            )
        elif args.rehearsal_preflight:
            report = audit_supabase_rehearsal_target(
                database_url,
                expected_project_ref=str(
                    os.getenv(args.expected_project_ref_env_key, "")
                ),
                production_project_ref=str(
                    os.getenv(args.production_project_ref_env_key, "")
                ),
                ssl_root_cert_path=str(
                    os.getenv(args.ssl_root_cert_env_key, "")
                ),
            )
        elif args.activation_target:
            report = audit_supabase_activation_target(
                database_url,
                storage_audit_database_url=storage_audit_database_url,
                expected_project_ref=str(
                    os.getenv(args.expected_project_ref_env_key, "")
                ),
            )
        else:
            report = audit_database(
                database_url,
                storage_audit_database_url=storage_audit_database_url,
            )
    except AuditConfigurationError as exc:
        report = _safe_failure(exc.code, contract=mode_contract)
    except RuntimeError as exc:
        code = str(exc) if str(exc) in {"postgres_driver_missing", "unexpected_database_row"} else "database_audit_failed"
        report = _safe_failure(code, contract=mode_contract)
    except Exception:
        report = _safe_failure(
            "database_connection_or_audit_failed",
            contract=mode_contract,
        )

    if args.evidence_output:
        try:
            _write_activation_evidence(report, args.evidence_output)
        except (AuditConfigurationError, OSError) as exc:
            code = exc.code if isinstance(exc, AuditConfigurationError) else "activation_evidence_write_failed"
            report = _safe_failure(code, contract=mode_contract)
    print(json.dumps(report, sort_keys=True))
    if args.rehearsal_atomic_apply:
        return 0 if report.get("ok") is True else 1
    if args.rehearsal_preflight:
        return 0 if report.get("ready") is True else 1
    if args.require_ready or args.ensure_schema:
        return 0 if report.get("ok") is True else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
