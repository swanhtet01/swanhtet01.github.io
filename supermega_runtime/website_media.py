"""Bounded, metadata-free photo preparation for private Sites assets."""

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
import re
from threading import BoundedSemaphore

from .trial_store import TrialNotReadyError, TrialValidationError

MAX_UPLOAD_BYTES = 4 * 1024 * 1024
MAX_ASSET_BYTES = 2 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
MAX_IMAGE_EDGE = 2048
IMAGE_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
ASSET_ID = re.compile(r"^[0-9a-f]{64}\.webp$")
_DECODER_SLOT = BoundedSemaphore(1)


@dataclass(frozen=True)
class PreparedPhoto:
    data: bytes
    width: int
    height: int

    @property
    def asset_id(self) -> str:
        return f"{sha256(self.data).hexdigest()}.webp"

    def receipt(self) -> dict:
        return {"assetId": self.asset_id, "sha256": sha256(self.data).hexdigest(),
                "contentType": "image/webp", "bytes": len(self.data),
                "width": self.width, "height": self.height, "visibility": "private"}


class _BoundedOutput(BytesIO):
    def write(self, value: bytes) -> int:
        if self.tell() + len(value) > MAX_ASSET_BYTES:
            raise TrialValidationError("The photo is too detailed. Choose a smaller image.")
        return super().write(value)


def prepare_photo(data: bytes, content_type: str) -> PreparedPhoto:
    if content_type not in IMAGE_TYPES:
        raise TrialValidationError("Choose a JPEG, PNG or WebP photo.")
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise TrialValidationError("Choose a photo smaller than 4 MB.")
    if not _DECODER_SLOT.acquire(blocking=False):
        raise TrialNotReadyError(("website_media_busy",))
    try:
        # Lazy import keeps the image codec out of unrelated API startup paths.
        from PIL import Image, ImageOps, UnidentifiedImageError
        try:
            with Image.open(BytesIO(data), formats=list(IMAGE_TYPES.values())) as source:
                if source.format != IMAGE_TYPES[content_type]:
                    raise TrialValidationError("The photo type does not match its contents.")
                width, height = source.size
                if width < 1 or height < 1 or width * height > MAX_IMAGE_PIXELS:
                    raise TrialValidationError("Choose a photo with at most 16 megapixels.")
                if getattr(source, "n_frames", 1) != 1:
                    raise TrialValidationError("Choose a still photo instead of an animation.")
                source.load()  # Reject truncation before re-encoding any content.
                with ImageOps.exif_transpose(source) as oriented:
                    oriented.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.Resampling.LANCZOS)
                    with oriented.convert("RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB") as pixels:
                        # Only pixels cross the boundary: no EXIF, GPS, comments or filenames.
                        pixels.info.clear()
                        output = _BoundedOutput()
                        pixels.save(output, format="WEBP", quality=85, method=4, exif=b"", icc_profile=b"", xmp=b"")
                        return PreparedPhoto(output.getvalue(), pixels.width, pixels.height)
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            raise TrialValidationError("This photo could not be opened. Choose another JPEG, PNG or WebP.") from exc
    except ImportError as exc:
        raise TrialNotReadyError(("website_media_codec_unavailable",)) from exc
    finally:
        _DECODER_SLOT.release()


def validate_asset_id(value: str) -> str:
    if not isinstance(value, str) or not ASSET_ID.fullmatch(value):
        raise TrialValidationError("Invalid photo reference.")
    return value


def private_object_path(workspace_id: str, asset_id: str) -> str:
    # Never let a request filename, path or workspace label become an object path.
    scope = sha256(workspace_id.encode("utf-8")).hexdigest()
    return f"{scope}/{validate_asset_id(asset_id)}"
