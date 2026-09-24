"""Private read-only catalog adapter. No HTTP route, grant or preparation API."""
from copy import deepcopy
from hashlib import sha256
from .ecommerce_customer_review import uuid
from .trial_store import TrialPermissionDenied, TrialNotReadyError, TrialValidationError

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

    def preview(self,principal,review_id):
        review_id=uuid(review_id)
        actor=principal.normalized()
        if actor.actor_kind!='human': raise TrialPermissionDenied('ecommerce.review')
        with self.store._guarded_cursor(actor,write=False,capability='ecommerce.review') as (cursor,_):
            _assert_storage(cursor)
            cursor.execute("select current_setting('transaction_isolation') as isolation")
            if cursor.fetchone()['isolation']!='read committed':
                raise TrialValidationError('ecommerce_review_requires_read_committed')
            cursor.execute("select pg_advisory_xact_lock(hashtextextended('ecommerce-review:' || %s,0))",(actor.workspace_id,))
            self.store._assert_active_identity_session(cursor,actor)
            if ('ecommerce.review' not in self.store._load_membership(cursor,actor)
                or 'ecommerce' not in self.store._product_entitlements(cursor,actor.workspace_id)):
                raise TrialPermissionDenied('ecommerce.review')
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
