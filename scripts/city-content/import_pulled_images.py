"""Validate licensed city-image manifests and atomically register pulled assets.

Image workers stage files and manifests but never write SQLite. This script is the single
database writer for pulled imagery, keeping licensing metadata and files in sync.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

from PIL import Image


ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "locz_cities.db"
ALLOWED_LICENSE_MARKERS = ("cc0", "cc by", "cc-by", "public domain")


@dataclass(frozen=True)
class Candidate:
    row_id: int
    city: str
    attraction: str
    storage_url: str
    source_url: str
    provider: str
    source: str
    license: str
    attribution: str | None
    attribution_required: int
    width: int
    height: int
    content_hash: str


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifests", nargs="+", type=Path)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def read_manifest(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("items")
    if not isinstance(data, list):
        raise ValueError("manifest must be a JSON list or an object with an items list")
    if not all(isinstance(item, dict) for item in data):
        raise ValueError("every manifest item must be an object")
    return data


def validate_license(item: dict) -> None:
    source_url = str(item.get("source_url", "")).strip()
    if not source_url.startswith("https://commons.wikimedia.org/wiki/File:"):
        raise ValueError("source_url must be an individual Wikimedia Commons File page")

    license_name = str(item.get("license", "")).strip()
    normalized = license_name.casefold()
    if not any(marker in normalized for marker in ALLOWED_LICENSE_MARKERS):
        raise ValueError(f"unsupported or unclear license: {license_name or 'missing'}")

    attribution_required = item.get("attribution_required")
    if attribution_required not in (0, 1, False, True):
        raise ValueError("attribution_required must be 0 or 1")
    if bool(attribution_required) and not str(item.get("attribution", "")).strip():
        raise ValueError("attribution is required for this license")


def validate_file(path: Path) -> tuple[int, int, str]:
    if path.suffix.lower() != ".webp":
        raise ValueError("file must be WebP")
    with Image.open(path) as image:
        if image.format != "WEBP":
            raise ValueError(f"extension is WebP but content is {image.format}")
        width, height = image.size
    if width < 1200:
        raise ValueError(f"{width}px wide; minimum is 1200px")
    ratio = width / height
    if abs(ratio - (4 / 3)) / (4 / 3) > 0.04:
        raise ValueError(f"aspect ratio {ratio:.3f}; expected approximately 1.333")
    return width, height, hashlib.sha256(path.read_bytes()).hexdigest()


def safe_staged_path(storage_url: str) -> Path:
    relative = PurePosixPath(storage_url)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("storage_url must be a safe relative path")
    path = (ROOT / Path(*relative.parts)).resolve()
    images_root = (ROOT / "images").resolve()
    if images_root not in path.parents:
        raise ValueError("storage_url must remain under scripts/city-content/images")
    return path


def canonical_storage_url(value: object) -> str:
    """Accept repo-relative worker output, but store paths relative to this data directory."""
    storage_url = str(value or "").strip().replace("\\", "/")
    prefix = "scripts/city-content/"
    if storage_url.startswith(prefix):
        storage_url = storage_url[len(prefix) :]
    return storage_url


def main() -> None:
    args = arguments()
    database = args.db.resolve()
    if not database.exists():
        raise SystemExit(f"Database does not exist: {database}")

    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    existing_hashes = {
        row[0]
        for row in connection.execute(
            "SELECT content_hash FROM city_images WHERE content_hash IS NOT NULL"
        )
    }
    batch_hashes: set[str] = set()
    seen_ids: set[int] = set()
    candidates: list[Candidate] = []
    failed = 0

    for manifest in args.manifests:
        try:
            items = read_manifest(manifest.resolve())
        except (OSError, ValueError, json.JSONDecodeError) as error:
            failed += 1
            print(f"FAIL  {manifest}: {error}")
            continue

        for item in items:
            label = f"{item.get('city', '?')} / {item.get('attraction', '?')}"
            try:
                row_id = int(item["id"])
                if row_id in seen_ids:
                    raise ValueError("duplicate row ID across manifests")
                row = connection.execute(
                    """
                    SELECT ci.id, ci.status, ci.kind, c.city_name, c.city_slug, a.name attraction
                    FROM city_images ci
                    JOIN cities c ON c.id = ci.city_id
                    LEFT JOIN city_attractions a ON a.id = ci.attraction_id
                    WHERE ci.id = ?
                    """,
                    (row_id,),
                ).fetchone()
                if row is None:
                    raise ValueError("unknown city_images ID")
                if row["kind"] != "ATTRACTION":
                    raise ValueError(f"row kind is {row['kind']}, not ATTRACTION")
                if row["status"] != "NEEDED":
                    raise ValueError(f"row status is {row['status']}, not NEEDED")
                if str(item.get("city", "")).strip() != row["city_name"]:
                    raise ValueError("city does not match database row")
                if str(item.get("attraction", "")).strip() != row["attraction"]:
                    raise ValueError("attraction does not match database row")

                storage_url = canonical_storage_url(item.get("storage_url"))
                expected = f"images/{row['city_slug']}/attraction-{row_id}.webp"
                if storage_url != expected:
                    raise ValueError(f"storage_url must be {expected}")
                validate_license(item)
                path = safe_staged_path(storage_url)
                if not path.exists():
                    raise ValueError("staged image is missing")
                width, height, digest = validate_file(path)
                claimed_hash = str(item.get("content_hash", "")).strip().lower()
                if claimed_hash and claimed_hash != digest:
                    raise ValueError("manifest content_hash does not match file")
                if digest in existing_hashes or digest in batch_hashes:
                    raise ValueError("duplicate content hash")

                provider = str(item.get("provider", "")).strip().lower()
                if provider not in ("wikimedia", "wikimedia-commons"):
                    raise ValueError("provider must identify Wikimedia Commons")
                source = str(item.get("source", "")).strip()
                if not source:
                    raise ValueError("source is required")
                attribution = str(item.get("attribution", "")).strip() or None

                candidate = Candidate(
                    row_id=row_id,
                    city=row["city_name"],
                    attraction=row["attraction"],
                    storage_url=storage_url,
                    source_url=str(item["source_url"]).strip(),
                    provider=provider,
                    source=source,
                    license=str(item["license"]).strip(),
                    attribution=attribution,
                    attribution_required=int(bool(item["attribution_required"])),
                    width=width,
                    height=height,
                    content_hash=digest,
                )
                candidates.append(candidate)
                batch_hashes.add(digest)
                seen_ids.add(row_id)
                print(f"OK    {candidate.city} / {candidate.attraction}: {width}x{height} {digest[:12]}")
            except (KeyError, OSError, TypeError, ValueError) as error:
                failed += 1
                print(f"FAIL  {label}: {error}")

    if not args.dry_run and candidates:
        with connection:
            for item in candidates:
                connection.execute(
                    """
                    UPDATE city_images
                    SET storage_url = ?, source_url = ?, provider = ?, source = ?, license = ?,
                        attribution = ?, attribution_required = ?, width = ?, height = ?,
                        content_hash = ?, status = 'PULLED'
                    WHERE id = ? AND status = 'NEEDED'
                    """,
                    (
                        item.storage_url,
                        item.source_url,
                        item.provider,
                        item.source,
                        item.license,
                        item.attribution,
                        item.attribution_required,
                        item.width,
                        item.height,
                        item.content_hash,
                        item.row_id,
                    ),
                )

    remaining = connection.execute(
        "SELECT COUNT(*) FROM city_images WHERE kind = 'ATTRACTION' AND status = 'NEEDED'"
    ).fetchone()[0]
    connection.close()
    action = "validated" if args.dry_run else "imported"
    print(f"\n{action} {len(candidates)} / failed {failed} / remaining attractions {remaining}")


if __name__ == "__main__":
    main()
