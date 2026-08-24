"""Validate rendered locator maps and atomically register their licensed metadata."""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from PIL import Image


ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "locz_cities.db"
PINNED_DATA_URL = (
    "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/"
    "ADM1/geoBoundaries-IND-ADM1_simplified.geojson"
)
PINNED_DATA_HASH = "4c63fe43294a391e8f2de4e9f86f3edb60f8688275b9fee90c61fb2aa0c26061"


@dataclass(frozen=True)
class Candidate:
    row_id: int
    city: str
    storage_url: str
    source_url: str
    source: str
    license: str
    attribution: str
    width: int
    height: int
    content_hash: str


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def safe_path(storage_url: str) -> Path:
    relative = PurePosixPath(storage_url)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError("storage_url must be a safe relative path")
    path = (ROOT / Path(*relative.parts)).resolve()
    if (ROOT / "images").resolve() not in path.parents:
        raise ValueError("storage_url must remain under images")
    return path


def validate_file(path: Path) -> tuple[int, int, str]:
    if path.suffix.lower() != ".webp":
        raise ValueError("map must be WebP")
    with Image.open(path) as image:
        if image.format != "WEBP":
            raise ValueError(f"extension is WebP but content is {image.format}")
        width, height = image.size
    if width < 1200 or height < 1200:
        raise ValueError("map must be at least 1200x1200")
    if abs(width / height - 1) > 0.01:
        raise ValueError("map must be square")
    return width, height, hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    args = arguments()
    items = json.loads(args.manifest.resolve().read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise SystemExit("Manifest must be a JSON list")

    connection = sqlite3.connect(args.db.resolve())
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

    for item in items:
        label = str(item.get("city", "?"))
        try:
            row_id = int(item["id"])
            if row_id in seen_ids:
                raise ValueError("duplicate row ID")
            row = connection.execute(
                """
                SELECT ci.id, ci.kind, ci.status, c.city_name, c.city_slug, c.state_ut,
                       c.latitude, c.longitude
                FROM city_images ci JOIN cities c ON c.id = ci.city_id
                WHERE ci.id = ?
                """,
                (row_id,),
            ).fetchone()
            if row is None:
                raise ValueError("unknown city_images ID")
            if row["kind"] != "MAP" or row["status"] != "NEEDED":
                raise ValueError(f"row is {row['kind']}/{row['status']}, expected MAP/NEEDED")
            if item.get("city") != row["city_name"] or item.get("state") != row["state_ut"]:
                raise ValueError("city or state does not match database")
            if abs(float(item["latitude"]) - row["latitude"]) > 1e-7 or abs(
                float(item["longitude"]) - row["longitude"]
            ) > 1e-7:
                raise ValueError("manifest coordinate does not match database")

            storage_url = str(item.get("storage_url", "")).replace("\\", "/")
            expected_path = f"images/{row['city_slug']}/map-{row_id}.webp"
            if storage_url != expected_path:
                raise ValueError(f"storage_url must be {expected_path}")
            if item.get("provider") != "geoboundaries":
                raise ValueError("provider must be geoboundaries")
            if item.get("source_url") != PINNED_DATA_URL or item.get("data_url") != PINNED_DATA_URL:
                raise ValueError("map must reference the pinned boundary URL")
            if item.get("boundary_data_hash") != PINNED_DATA_HASH:
                raise ValueError("boundary data hash does not match pinned source")
            license_name = str(item.get("license", ""))
            if "CC BY 2.5 IN" not in license_name:
                raise ValueError("dataset-specific CC BY 2.5 IN license is required")
            attribution = str(item.get("attribution", "")).strip()
            if item.get("attribution_required") is not True or not attribution:
                raise ValueError("complete required attribution is missing")
            if item.get("status") != "GENERATED" or item.get("kind") != "MAP":
                raise ValueError("manifest status/kind must be GENERATED/MAP")

            path = safe_path(storage_url)
            if not path.exists():
                raise ValueError("staged map is missing")
            width, height, digest = validate_file(path)
            if item.get("content_hash") != digest:
                raise ValueError("manifest content_hash does not match file")
            if digest in existing_hashes or digest in batch_hashes:
                raise ValueError("duplicate content hash")

            candidates.append(
                Candidate(
                    row_id=row_id,
                    city=row["city_name"],
                    storage_url=storage_url,
                    source_url=PINNED_DATA_URL,
                    source=str(item["source"]),
                    license=license_name,
                    attribution=attribution,
                    width=width,
                    height=height,
                    content_hash=digest,
                )
            )
            batch_hashes.add(digest)
            seen_ids.add(row_id)
            print(f"OK    {label}: {width}x{height} {digest[:12]}")
        except (KeyError, OSError, TypeError, ValueError) as error:
            failed += 1
            print(f"FAIL  {label}: {error}")

    if not args.dry_run and candidates:
        with connection:
            for item in candidates:
                connection.execute(
                    """
                    UPDATE city_images
                    SET storage_url = ?, source_url = ?, provider = 'geoboundaries',
                        source = ?, license = ?, attribution = ?, attribution_required = 1,
                        width = ?, height = ?, content_hash = ?, status = 'GENERATED'
                    WHERE id = ? AND status = 'NEEDED'
                    """,
                    (
                        item.storage_url,
                        item.source_url,
                        item.source,
                        item.license,
                        item.attribution,
                        item.width,
                        item.height,
                        item.content_hash,
                        item.row_id,
                    ),
                )

    remaining = connection.execute(
        """
        SELECT COUNT(*) FROM city_images ci JOIN cities c ON c.id = ci.city_id
        WHERE c.tier = 1 AND ci.kind = 'MAP' AND ci.status = 'NEEDED'
        """
    ).fetchone()[0]
    connection.close()
    action = "validated" if args.dry_run else "imported"
    print(f"\n{action} {len(candidates)} / failed {failed} / Tier-1 maps remaining {remaining}")


if __name__ == "__main__":
    main()
