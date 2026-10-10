"""Require committed workspace media receipts before a managed state write.

Called inside the command transaction after schema validation and before the
state/version/event writes. Includes retained artifacts, not just current pages.
"""
from .trial_store import TrialValidationError


def website_asset_ids(value: object) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        image = value.get("image")
        if isinstance(image, dict) and isinstance(image.get("assetId"), str):
            found.add(image["assetId"])
        for child in value.values():
            found.update(website_asset_ids(child))
    elif isinstance(value, list):
        for child in value:
            found.update(website_asset_ids(child))
    return found


def require_website_media_receipts(cursor, workspace_id: str, state: dict) -> None:
    asset_ids = website_asset_ids(state)
    if not asset_ids:
        return
    cursor.execute("""select distinct result_json->>'assetId' as asset_id
        from app_private.workspace_events
        where workspace_id=%s and surface='website' and event_type='website.media.uploaded'
          and result_json->>'assetId'=any(%s)
          and result_json->>'visibility'='private'
          and result_json->>'contentType'='image/webp'
          and result_json->>'sha256'=left(result_json->>'assetId',64)""",
        (workspace_id, sorted(asset_ids)))
    retained = {row["asset_id"] for row in cursor.fetchall()}
    if retained != asset_ids:
        raise TrialValidationError("A photo is not saved in this workspace. Upload it here before saving the page.")
