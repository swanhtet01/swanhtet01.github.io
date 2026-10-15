"""Private binary image transport, mounted beside the existing managed routes."""

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.requests import ClientDisconnect

from .trial_store import PostgresTrialStore
from .website_media import IMAGE_TYPES, MAX_UPLOAD_BYTES, prepare_photo, validate_asset_id
from .website_media_storage import MediaStorageConfig, SupabasePrivateMediaStorage
from .website_media_store import WebsiteMediaStore

PRIVATE_HEADERS = {"Cache-Control": "private, no-store", "Pragma": "no-cache",
                   "X-Content-Type-Options": "nosniff", "Vary": "Authorization, X-Supermega-Workspace-Id"}


def mount_website_media_routes(router, *, store, resolve_principal):
    # Imported here to reuse canonical auth/error mapping without a module cycle.
    from .trial_runtime import _resolve_principal, _readiness, _require_read_ready, _require_write_ready, _error, _invoke

    def authorized(request, *, write):
        actor = _resolve_principal(request, resolve_principal)
        if actor.actor_kind != "human":
            raise _error(403, "website_media_human_required")
        ready = _readiness(store, actor)
        if write:
            _require_write_ready(ready, "website.write")
        else:
            _require_read_ready(ready)
        if not isinstance(store, PostgresTrialStore):
            raise _error(503, "website_media_storage_unavailable")
        config = MediaStorageConfig.from_environment()
        if not config.ready:
            raise _error(503, "website_media_storage_unavailable")
        return actor, WebsiteMediaStore(store, SupabasePrivateMediaStorage(config))

    @router.post("/website-media")
    async def upload_photo(request: Request):
        try:
            actor, adapter = await run_in_threadpool(authorized, request, write=True)
            if request.query_params:
                raise _error(422, "website_media_request_invalid")
            content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if content_type not in IMAGE_TYPES:
                raise _error(415, "website_media_photo_required")
            declared = request.headers.get("content-length")
            if declared is not None:
                if not declared.isascii() or not declared.isdecimal():
                    raise _error(400, "website_media_invalid_content_length")
                if len(declared) > 10 or int(declared) > MAX_UPLOAD_BYTES:
                    raise _error(413, "website_media_too_large")
            body = bytearray()
            async for chunk in request.stream():
                if len(body) + len(chunk) > MAX_UPLOAD_BYTES:
                    raise _error(413, "website_media_too_large")
                body.extend(chunk)
            photo = await run_in_threadpool(_invoke, lambda: prepare_photo(bytes(body), content_type))
            result = await run_in_threadpool(_invoke, lambda: adapter.put(actor, photo))
            return JSONResponse(result, status_code=201, headers=PRIVATE_HEADERS)
        except ClientDisconnect as exc:
            raise HTTPException(status_code=400, detail={"code": "website_media_upload_interrupted"}, headers=PRIVATE_HEADERS) from exc
        except HTTPException as exc:
            exc.headers = {**(exc.headers or {}), **PRIVATE_HEADERS}
            raise

    @router.get("/website-media/{asset_id}")
    async def read_photo(asset_id: str, request: Request):
        try:
            actor, adapter = await run_in_threadpool(authorized, request, write=False)
            if request.query_params:
                raise _error(422, "website_media_request_invalid")
            await run_in_threadpool(_invoke, lambda: validate_asset_id(asset_id))
            data, receipt = await run_in_threadpool(_invoke, lambda: adapter.get(actor, asset_id))
            return Response(data, media_type="image/webp", headers={**PRIVATE_HEADERS,
                "Content-Disposition": 'inline; filename="website-photo.webp"',
                "Content-Security-Policy": "default-src 'none'; sandbox",
                "X-Content-SHA256": receipt["sha256"]})
        except HTTPException as exc:
            exc.headers = {**(exc.headers or {}), **PRIVATE_HEADERS}
            raise
