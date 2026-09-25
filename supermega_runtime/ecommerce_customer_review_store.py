"""Private catalog review adapter. No grant or publication authority."""
from copy import deepcopy
from contextlib import contextmanager
from datetime import timedelta, timezone
import json
from .commerce_runtime import commerce_storefront_preview, commerce_storefront_preview_digest
from hashlib import sha256
from .ecommerce_customer_review import uuid, stamp
from .website_customer_review import _text
from .trial_store import TrialPermissionDenied, TrialNotReadyError, TrialValidationError, TrialInvalidTransition, TrialIdempotencyConflict

# Reviewed local candidate bodies, LF-normalized and outer-trimmed only.
FUNCTIONS = {
    "ecommerce_review_text_length": (1, "bigint", "sql", False, "i", "789f685f8ef315e66146b9bd853f4f68e40e3de2e4e022a506ff4679c3a0579f"),
    "ecommerce_review_projection": (1, "jsonb", "plpgsql", False, "i", "958a3fea1726d57a4e833a0888102edb2a3d1105cd7f3c5f84d4741c2294c976"),
    "ecommerce_review_preview_digest": (1, "text", "plpgsql", False, "i", "fba073c4a638ca22f7a267cd8c2912999b89c245b7f0df895142f98fed8f726d"),
    "ecommerce_review_operator_entitled": (0, "boolean", "sql", True, "s", "e955a42c7af14d7f0c67299a53439452f40d1e17c3db2d466e02d112f5c27c9c"),
    "ecommerce_review_recipient_ready": (1, "boolean", "sql", True, "s", "1f551f0ba4b8b7fa9f87e3f70cb8211c0d10268461a5a80ee5ca670f7dd13611"),
    "guard_ecommerce_review": (0, "trigger", "plpgsql", False, "v", "41583ca2889b54fcf7c77c68d307f55ec127b218b27f3bc001cf05418e4776d9"),
    "invalidate_ecommerce_reviews": (0, "trigger", "plpgsql", False, "v", "2f8e3905cd867d3a118d4fd6eaf9963248cee9ea14cfd7df0160d073f2167959"),
}

def _assert_storage(cursor):
    cursor.execute("""select p.proname as name,p.pronargs as args,
        p.prorettype::regtype::text as result,l.lanname as language,
        p.prosecdef as definer,p.provolatile as volatility,p.proconfig as config,p.prosrc as source,
        (r.rolsuper or r.rolbypassrls) and r.rolname<>current_user as trusted_owner,
        not has_function_privilege('anon',p.oid,'EXECUTE')
          and not has_function_privilege('authenticated',p.oid,'EXECUTE')
          and not has_function_privilege('service_role',p.oid,'EXECUTE') as private_execute
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        join pg_roles r on r.oid=p.proowner join pg_language l on l.oid=p.prolang
        where n.nspname='app_private' and p.proname=any(%s)""",(list(FUNCTIONS),))
    rows=cursor.fetchall()
    if len(rows)!=len(FUNCTIONS): raise TrialNotReadyError(('ecommerce_review_storage_ready',))
    for row in rows:
        expected=FUNCTIONS[row['name']]
        actual=(row['args'],row['result'],row['language'],row['definer'],row['volatility'],
                sha256(row['source'].replace('\r\n','\n').strip().encode()).hexdigest())
        if (actual!=expected or row['trusted_owner'] is not True or row['private_execute'] is not True
            or tuple(row['config'] or ())!=('search_path=pg_catalog, app_private',)):
            raise TrialNotReadyError(('ecommerce_review_storage_ready',))
    cursor.execute("""select count(*) as guards from pg_trigger t
        join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app_private' and not t.tgisinternal and
        (c.relname,t.tgname) in (('ecommerce_customer_reviews','ecommerce_review_guard'),
        ('workspace_state','ecommerce_reviews_invalidate'))""")
    if cursor.fetchone()['guards']!=2: raise TrialNotReadyError(('ecommerce_review_storage_ready',))

class EcommerceCustomerReviewStore:
    def __init__(self,store):
        self.store=store

    @contextmanager
    def _transaction(self,principal,*,write=False,lock_source=False,capability=None):
        capability=capability or ('commerce.write' if write else 'ecommerce.review')
        actor=principal.normalized()
        if actor.actor_kind!='human': raise TrialPermissionDenied(capability)
        with self.store._guarded_cursor(actor,write=write,capability=capability) as (cursor,_):
            _assert_storage(cursor)
            cursor.execute("select current_setting('transaction_isolation') as isolation")
            if cursor.fetchone()['isolation']!='read committed':
                raise TrialValidationError('ecommerce_review_requires_read_committed')
            if lock_source:
                cursor.execute("select version from app_private.workspace_state where workspace_id=%s and surface='commerce' for update",(actor.workspace_id,))
                if cursor.fetchone() is None: raise TrialValidationError('ecommerce_review_source_missing')
            cursor.execute("select pg_advisory_xact_lock(hashtextextended('ecommerce-review:' || %s,0))",(actor.workspace_id,))
            self.store._assert_active_identity_session(cursor,actor)
            if (capability not in self.store._load_membership(cursor,actor)
                or 'ecommerce' not in self.store._product_entitlements(cursor,actor.workspace_id)):
                raise TrialPermissionDenied(capability)
            yield cursor,actor

    def preparation_preview(self,principal):
        """Read saved public catalog facts; prepare still checks version under lock."""
        with self._transaction(principal,capability='commerce.write') as (cursor,actor):
            cursor.execute("select version,state_json,clock_timestamp() as read_at from app_private.workspace_state where workspace_id=%s and surface='commerce'",(actor.workspace_id,))
            source=cursor.fetchone()
            if source is None: raise TrialValidationError('ecommerce_review_source_missing')
            if not 1<=source['version']<=9_007_199_254_740_991:
                raise TrialValidationError('ecommerce_review_source_stale')
            preview=commerce_storefront_preview(source['state_json'])
            result=dict(status='saved_source_preview',sourceVersion=source['version'],
                contentRevision=source['state_json']['storefrontConfiguration']['revision'],
                preview=deepcopy(preview),previewDigest=commerce_storefront_preview_digest(source['state_json']),
                readAt=source['read_at'].isoformat(),reviewCreated=False,
                publicationAuthorized=False,deploymentAuthorized=False)
        return result

    def resolve_expired(self,principal,review_id,*,expires_at):
        """Confirm absence only after this exact request can no longer prepare."""
        review_id=uuid(review_id)
        expiry=stamp(expires_at)
        with self._transaction(principal,capability='commerce.write') as (cursor,actor):
            # Preparation checks expiry after acquiring this same advisory lock.
            # Do not treat absence before expiry as cancellation or terminal proof.
            cursor.execute('select clock_timestamp() as now')
            now=cursor.fetchone()['now']
            if expiry>now: raise TrialValidationError('ecommerce_review_request_not_expired')
            cursor.execute('select review_id from app_private.ecommerce_customer_reviews where workspace_id=%s and review_id=%s',
                (actor.workspace_id,review_id))
            if cursor.fetchone() is not None: raise TrialValidationError('ecommerce_review_assignment_exists')
            result=dict(reviewId=review_id,status='absent_expired',expiresAt=expiry.isoformat(),
                readAt=now.isoformat(),publicationAuthorized=False,deploymentAuthorized=False)
        return result

    def reconcile(self,principal,review_id):
        """Read only the caller's retained assignment; absence stays uncertain."""
        review_id=uuid(review_id)
        with self._transaction(principal,capability='commerce.write') as (cursor,actor):
            cursor.execute("""select source_version,content_revision,preview_digest,prepared_at,
                    expires_at,status,clock_timestamp() as read_at
                from app_private.ecommerce_customer_reviews
                where workspace_id=%s and prepared_by=%s and review_id=%s""",
                (actor.workspace_id,actor.actor_id,review_id))
            row=cursor.fetchone()
            if row is None: raise TrialPermissionDenied('commerce.write')
            status=row['status']
            if status=='active' and row['expires_at']<=row['read_at']: status='expired'
            result=dict(reviewId=review_id,status=status,sourceVersion=row['source_version'],
                contentRevision=row['content_revision'],previewDigest=row['preview_digest'],
                preparedAt=row['prepared_at'].isoformat(),expiresAt=row['expires_at'].isoformat(),
                readAt=row['read_at'].isoformat(),publicationAuthorized=False,deploymentAuthorized=False)
        return result

    def preview(self,principal,review_id):
        review_id=uuid(review_id)
        with self._transaction(principal) as (cursor,actor):
            cursor.execute("""select review_id,content_revision,preview,preview_digest,expires_at
                from app_private.ecommerce_customer_reviews
                where workspace_id=%s and recipient_actor_id=%s and review_id=%s and status='active'
                  and prepared_at<=clock_timestamp() and expires_at>clock_timestamp()""",
                (actor.workspace_id,actor.actor_id,review_id))
            row=cursor.fetchone()
            if row is None: raise TrialPermissionDenied('ecommerce.review')
            result=dict(reviewId=str(row['review_id']),contentRevision=row['content_revision'],
                        preview=deepcopy(row['preview']),previewDigest=row['preview_digest'],
                        expiresAt=row['expires_at'].isoformat(),status='prepared_preview',
                        publicationAuthorized=False,deploymentAuthorized=False)
        return result

    def _enrolled_recipients(self, cursor, actor, *, after: str | None = None,
                            grant_id: str | None = None):
        # Reuse private owner-authorized grant records, not a membership/Auth
        # directory. This list is for the owner managing delivery, not reviewers
        # or ordinary content editors. A reference never grants access itself.
        if not {"company.write", "approvals.decide"}.issubset(self.store._load_membership(cursor, actor)):
            raise TrialPermissionDenied("approvals.decide")
        cursor.execute("""select e.command_id as grant_id,
                e.payload_json->>'memberLabel' as label,
                e.payload_json->>'memberActorId' as recipient
            from app_private.workspace_events e
            join app_private.approval_requests a on a.workspace_id=e.workspace_id
                and a.command_id=e.command_id and a.command_fingerprint=e.command_fingerprint
            where e.workspace_id=%s and e.surface='company'
                and e.event_type='company.staff_access.granted' and e.actor_kind='human'
                and e.actor_id=%s and e.event_id=e.command_id
                and a.status='approved' and a.requested_by=e.actor_id and a.decided_by=e.actor_id
                and a.requested_actor_kind='human' and a.decided_actor_kind='human'
                and a.decision_contract_version=2 and e.created_at>=a.decided_at
                and e.payload_json->>'roleId'='ecommerce-reviewer'
                and e.payload_json->'products'='["ecommerce"]'::jsonb
                and e.payload_json->'capabilities'='["ecommerce.review"]'::jsonb
                and e.result_json->>'contract'='supermega.workspace_staff_access_event.v1'
                and e.result_json->>'status'='active'
                and e.result_json->>'roleId'='ecommerce-reviewer'
                and e.result_json->>'memberActorId'=e.payload_json->>'memberActorId'
                and e.result_json->>'staffAccessPlanDigest'='sha256:' || e.command_fingerprint
                and not exists (select 1 from app_private.workspace_events r
                    where r.workspace_id=e.workspace_id and r.event_type='company.staff_access.revoked'
                    and r.result_json->>'staffAccessPlanDigest'=e.result_json->>'staffAccessPlanDigest')
                and app_private.ecommerce_review_recipient_ready(e.payload_json->>'memberActorId')
                and (%s::uuid is null or e.command_id>%s::uuid)
                and (%s::uuid is null or e.command_id=%s::uuid)
            order by e.command_id limit 51""", (actor.workspace_id, actor.actor_id, after, after, grant_id, grant_id))
        return cursor.fetchall()

    def list_recipients(self, principal, *, after: str | None = None):
        if after is not None:
            after = uuid(after)
        with self._transaction(principal, write=False, capability="commerce.write") as (cursor, actor):
            rows = self._enrolled_recipients(cursor, actor, after=after)
            recipients = [{"grantId": str(row["grant_id"]), "label": _text(row["label"], 120)} for row in rows[:50]]
            return {"recipients": recipients, "nextAfter": recipients[-1]["grantId"] if len(rows) > 50 else None,
                    "order": "grant_id_ascending", "accessGranted": False}

    def prepare(self,principal,*,review_id,recipient_actor_id=None,recipient_grant_id=None,expected_version,expires_at):
        if (recipient_actor_id is None)==(recipient_grant_id is None):
            raise TrialValidationError('ecommerce_review_recipient_invalid')
        review_id=uuid(review_id)
        recipient=uuid(recipient_actor_id) if recipient_actor_id is not None else None
        grant_id=uuid(recipient_grant_id) if recipient_grant_id is not None else None
        expiry=stamp(expires_at)
        if type(expected_version) is not int or not 1<=expected_version<=9_007_199_254_740_991:
            raise TrialValidationError('ecommerce_review_source_stale')
        with self._transaction(principal,write=True,lock_source=True) as (cursor,actor):
            if grant_id is not None:
                recipients=self._enrolled_recipients(cursor,actor,grant_id=grant_id)
                if len(recipients)!=1: raise TrialPermissionDenied('ecommerce.review')
                recipient=uuid(recipients[0]['recipient'])
            cursor.execute('select clock_timestamp() as now')
            now=cursor.fetchone()['now']
            if not now<expiry<=now+timedelta(days=7): raise TrialValidationError('ecommerce_review_expiry_invalid')
            cursor.execute("select version,state_json from app_private.workspace_state where workspace_id=%s and surface='commerce'",(actor.workspace_id,))
            source=cursor.fetchone()
            if source is None or source['version']!=expected_version: raise TrialValidationError('ecommerce_review_source_stale')
            preview=commerce_storefront_preview(source['state_json'])
            digest=commerce_storefront_preview_digest(source['state_json'])
            cursor.execute('select app_private.ecommerce_review_recipient_ready(%s) as ready',(recipient,))
            if cursor.fetchone()['ready'] is not True: raise TrialPermissionDenied('ecommerce.review')
            cursor.execute('select recipient_actor_id,prepared_by,source_version,preview_digest,expires_at,status from app_private.ecommerce_customer_reviews where workspace_id=%s and review_id=%s',(actor.workspace_id,review_id))
            prior=cursor.fetchone()
            if prior is not None:
                if (prior['recipient_actor_id']!=recipient or prior['prepared_by']!=actor.actor_id
                    or prior['source_version']!=expected_version or prior['preview_digest']!=digest
                    or prior['expires_at']!=expiry or prior['status']!='active'):
                    raise TrialValidationError('ecommerce_review_prepare_conflict')
            else:
                cursor.execute("""insert into app_private.ecommerce_customer_reviews
                    (review_id,workspace_id,recipient_actor_id,prepared_by,source_version,preview,preview_digest,expires_at)
                    values (%s,%s,%s,%s,%s,%s::jsonb,%s,%s)""",
                    (review_id,actor.workspace_id,recipient,actor.actor_id,expected_version,json.dumps(preview,ensure_ascii=False),digest,expiry))
            cursor.execute("select prepared_at,content_revision from app_private.ecommerce_customer_reviews where workspace_id=%s and review_id=%s and status='active' and expires_at>clock_timestamp()",(actor.workspace_id,review_id))
            retained=cursor.fetchone()
            if retained is None: raise TrialValidationError('ecommerce_review_expired')
            result=dict(reviewId=review_id,sourceVersion=expected_version,contentRevision=retained['content_revision'],
                preparedAt=retained['prepared_at'].isoformat(),expiresAt=expiry.isoformat(),previewDigest=digest,
                status='prepared_preview',persisted=True,replayed=prior is not None,publicationAuthorized=False,deploymentAuthorized=False)
        return result

    def revoke(self,principal,review_id):
        review_id=uuid(review_id)
        with self._transaction(principal,write=True) as (cursor,actor):
            cursor.execute('select status from app_private.ecommerce_customer_reviews where workspace_id=%s and review_id=%s',(actor.workspace_id,review_id))
            prior=cursor.fetchone()
            if prior is None: raise TrialPermissionDenied('commerce.write')
            replay=prior['status']=='revoked'
            if not replay:
                cursor.execute("update app_private.ecommerce_customer_reviews set status='revoked' where workspace_id=%s and review_id=%s returning status",(actor.workspace_id,review_id))
                if (cursor.fetchone() or {}).get('status')!='revoked': raise TrialValidationError('ecommerce_review_revoke_failed')
            result=dict(reviewId=review_id,status='revoked',persisted=True,replayed=replay,publicationAuthorized=False,deploymentAuthorized=False)
        return result


    def decisions(self, principal, review_id, *, after=None):
        """Read a bounded page of the assigned customer's retained decisions."""
        review_id = uuid(review_id)
        after = uuid(after) if after is not None else None
        with self._transaction(principal, capability='ecommerce.review') as (cursor, actor):
            cursor.execute("""select source_version,content_revision,preview_digest
                from app_private.ecommerce_customer_reviews
                where workspace_id=%s and recipient_actor_id=%s and review_id=%s
                  and status='active' and prepared_at<=clock_timestamp()
                  and expires_at>clock_timestamp()""", (actor.workspace_id, actor.actor_id, review_id))
            assignment = cursor.fetchone()
            if assignment is None: raise TrialPermissionDenied('ecommerce.review')
            cursor.execute("""select command_id,kind,note,created_at
                from app_private.ecommerce_customer_decisions
                where workspace_id=%s and actor_id=%s and review_id=%s
                  and source_version=%s and content_revision=%s and preview_digest=%s
                  and (%s::uuid is null or command_id>%s::uuid)
                order by command_id limit 51""",
                (actor.workspace_id, actor.actor_id, review_id, assignment['source_version'],
                 assignment['content_revision'], assignment['preview_digest'], after, after))
            rows = cursor.fetchall()
            items = [dict(commandId=str(row['command_id']), kind=row['kind'],
                          note=row['note'], createdAt=row['created_at'].astimezone(timezone.utc).isoformat())
                     for row in rows[:50]]
            result = dict(reviewId=review_id, sourceVersion=assignment['source_version'],
                contentRevision=assignment['content_revision'], previewDigest=assignment['preview_digest'],
                decisions=items, nextAfter=items[-1]['commandId'] if len(rows)>50 else None,
                publicationAuthorized=False, deploymentAuthorized=False)
        return result

    def operator_decisions(self, principal, review_id, *, after=None):
        """Read retained responses for the caller's own prepared review, including history."""
        review_id = uuid(review_id)
        after = uuid(after) if after is not None else None
        with self._transaction(principal, capability='commerce.write') as (cursor, actor):
            cursor.execute("""select source_version,content_revision,preview_digest,recipient_actor_id,
                    status,expires_at,clock_timestamp() as read_at
                from app_private.ecommerce_customer_reviews
                where workspace_id=%s and prepared_by=%s and review_id=%s""",
                (actor.workspace_id, actor.actor_id, review_id))
            assignment = cursor.fetchone()
            if assignment is None: raise TrialPermissionDenied('commerce.write')
            cursor.execute("""select command_id,kind,note,created_at
                from app_private.ecommerce_customer_decisions
                where workspace_id=%s and actor_id=%s and review_id=%s
                  and source_version=%s and content_revision=%s and preview_digest=%s
                  and (%s::uuid is null or command_id>%s::uuid)
                order by command_id limit 51""",
                (actor.workspace_id, assignment['recipient_actor_id'], review_id,
                 assignment['source_version'], assignment['content_revision'], assignment['preview_digest'], after, after))
            rows = cursor.fetchall()
            items = [dict(commandId=str(row['command_id']), kind=row['kind'], note=row['note'],
                          createdAt=row['created_at'].astimezone(timezone.utc).isoformat()) for row in rows[:50]]
            status = assignment['status']
            if status == 'active' and assignment['expires_at'] <= assignment['read_at']: status = 'expired'
            return dict(reviewId=review_id, status=status, sourceVersion=assignment['source_version'],
                contentRevision=assignment['content_revision'], previewDigest=assignment['preview_digest'],
                readAt=assignment['read_at'].astimezone(timezone.utc).isoformat(), decisions=items,
                nextAfter=items[-1]['commandId'] if len(rows)>50 else None,
                publicationAuthorized=False, deploymentAuthorized=False)

    def record_decision(self, principal, payload, *, kind):
        """Commit an exact customer command; no route or publication authority.

        Current assignment/access are checked before any retained command lookup.
        An expired or revoked assignment cannot be used to replay a receipt.
        """
        from .ecommerce_customer_review import CONTRACT, build_catalog_acceptance, build_catalog_change_request
        from .trial_store import TrialReadiness
        if kind not in ('acceptance', 'feedback') or not isinstance(payload, dict):
            raise TrialValidationError('ecommerce_decision_payload_invalid')
        review_id = uuid(payload.get('reviewId'))
        with self._transaction(principal, write=True, capability='ecommerce.review') as (cursor, actor):
            cursor.execute("""select *,clock_timestamp() as checked_at
                from app_private.ecommerce_customer_reviews
                where workspace_id=%s and recipient_actor_id=%s and review_id=%s""",
                (actor.workspace_id, actor.actor_id, review_id))
            row = cursor.fetchone()
            if row is None: raise TrialPermissionDenied('ecommerce.review')
            assignment = dict(contract=CONTRACT, reviewId=str(row['review_id']), workspaceId=row['workspace_id'],
                recipientActorId=row['recipient_actor_id'], preparedBy=row['prepared_by'],
                preparedAt=row['prepared_at'].astimezone(timezone.utc).isoformat(), expiresAt=row['expires_at'].astimezone(timezone.utc).isoformat(),
                sourceVersion=row['source_version'], contentRevision=row['content_revision'],
                preview=row['preview'], previewDigest=row['preview_digest'], status=row['status'])
            # These flags are established by the guarded transaction and its
            # post-lock membership/session/entitlement recheck, not caller input.
            verified = TrialReadiness(backend='postgres', database_ready=True, role_ready=True,
                schema_ready=True, auth_ready=True, membership_ready=True, audit_ready=True,
                write_enabled=True, capabilities=frozenset({'ecommerce.review'}), product_entitlements=('ecommerce',))
            build = build_catalog_acceptance if kind == 'acceptance' else build_catalog_change_request
            candidate = build(assignment, payload, principal=actor, readiness=verified,
                source_version=row['source_version'], now=row['checked_at'].astimezone(timezone.utc))
            params = (actor.workspace_id, actor.actor_id, candidate['commandId'])
            query = """select review_id,source_version,content_revision,preview_digest,command_fingerprint,kind,note,created_at
                from app_private.ecommerce_customer_decisions where workspace_id=%s and actor_id=%s and command_id=%s"""
            cursor.execute(query, params)
            retained = cursor.fetchone()
            replayed = retained is not None
            if retained is None:
                # The shared review lock serializes this check with all decision writes.
                cursor.execute("""select 1 from app_private.ecommerce_customer_decisions
                    where workspace_id=%s and review_id=%s and (kind='acceptance' or %s='acceptance') limit 1""",
                    (actor.workspace_id, review_id, kind))
                if cursor.fetchone() is not None:
                    raise TrialInvalidTransition('ecommerce_decision_already_recorded')
                cursor.execute("""insert into app_private.ecommerce_customer_decisions
                    (workspace_id,actor_id,command_id,review_id,source_version,content_revision,preview_digest,command_fingerprint,kind,note)
                    values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (*params, review_id, candidate['sourceVersion'], candidate['contentRevision'],
                     candidate['previewDigest'], candidate['commandFingerprint'], kind, candidate.get('note')))
                cursor.execute(query, params)
                retained = cursor.fetchone()
            if (retained is None or str(retained['review_id']) != review_id
                or retained['source_version'] != candidate['sourceVersion']
                or retained['content_revision'] != candidate['contentRevision']
                or retained['preview_digest'] != candidate['previewDigest']
                or retained['command_fingerprint'] != candidate['commandFingerprint']
                or retained['kind'] != kind or retained['note'] != candidate.get('note')):
                raise TrialIdempotencyConflict(candidate['commandId'])
            result = candidate | dict(persisted=True, replayed=replayed)
            result['acceptedAt' if kind == 'acceptance' else 'createdAt'] = retained['created_at'].astimezone(timezone.utc).isoformat()
        return result
