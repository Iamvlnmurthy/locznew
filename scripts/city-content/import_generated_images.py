"""Validate generated city images and atomically register them in the staging database.

Generation workers deliberately do not write SQLite. This importer is the single writer after
a batch finishes, preventing concurrent database corruption and preventing partial metadata
when one asset in a batch is malformed.
"""

from __future__ import annotations

import argparse
import hashlib
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "locz_cities.db"


@dataclass(frozen=True)
class Candidate:
    row_id: int
    city: str
    kind: str
    path: Path
    storage_url: str
    width: int
    height: int
    content_hash: str


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--tier", type=int, choices=(1, 2), required=True)
    parser.add_argument("--kind", choices=("HERO", "ATTRACTION"), required=True)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def expected_ratio(kind: str) -> float:
    return 16 / 9 if kind == "HERO" else 4 / 3


def validate(path: Path, kind: str) -> tuple[int, int, str]:
    if path.suffix.lower() != ".webp":
        raise ValueError("file must be WebP")

    with Image.open(path) as image:
        if image.format != "WEBP":
            raise ValueError(f"file extension is WebP but content is {image.format}")
        width, height = image.size

    minimum_width = 1600 if kind == "HERO" else 1200
    if width < minimum_width:
        raise ValueError(f"{width}px wide; minimum is {minimum_width}px")

    ratio = width / height
    target = expected_ratio(kind)
    if abs(ratio - target) / target > 0.04:
        raise ValueError(f"aspect ratio {ratio:.3f}; expected approximately {target:.3f}")

    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return width, height, digest


def main() -> None:
    args = arguments()
    database = args.db.resolve()
    if not database.exists():
        raise SystemExit(f"Database does not exist: {database}")

    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        """
        SELECT ci.id, ci.kind, c.city_name, c.city_slug
        FROM city_images ci
        JOIN cities c ON c.id = ci.city_id
        WHERE c.tier = ? AND ci.kind = ? AND ci.status = 'NEEDED' AND ci.provider = 'codex'
        ORDER BY c.city_name, ci.id
        """,
        (args.tier, args.kind),
    ).fetchall()

    existing_hashes = {
        row[0]
        for row in connection.execute(
            "SELECT content_hash FROM city_images WHERE content_hash IS NOT NULL"
        )
    }
    batch_hashes: set[str] = set()
    candidates: list[Candidate] = []
    failed = 0

    for row in rows:
        path = ROOT / "images" / row["city_slug"] / f"{row['kind'].lower()}-{row['id']}.webp"
        if not path.exists():
            print(f"MISS  {row['city_name']}: {path.relative_to(ROOT)}")
            continue
        try:
            width, height, digest = validate(path, row["kind"])
            if digest in existing_hashes or digest in batch_hashes:
                raise ValueError("duplicate content hash")
        except (OSError, ValueError) as error:
            failed += 1
            print(f"FAIL  {row['city_name']}: {error}")
            continue

        batch_hashes.add(digest)
        candidates.append(
            Candidate(
                row_id=row["id"],
                city=row["city_name"],
                kind=row["kind"],
                path=path,
                storage_url=path.relative_to(ROOT).as_posix(),
                width=width,
                height=height,
                content_hash=digest,
            )
        )
        print(f"OK    {row['city_name']}: {width}x{height} {digest[:12]}")

    if not args.dry_run and candidates:
        with connection:
            for item in candidates:
                connection.execute(
                    """
                    UPDATE city_images
                    SET storage_url = ?, source_url = NULL, provider = 'codex',
                        source = 'OpenAI image generation for LocZ',
                        license = 'LocZ-generated', attribution = NULL,
                        attribution_required = 0, width = ?, height = ?,
                        content_hash = ?, status = 'GENERATED'
                    WHERE id = ? AND status = 'NEEDED'
                    """,
                    (
                        item.storage_url,
                        item.width,
                        item.height,
                        item.content_hash,
                        item.row_id,
                    ),
                )

    remaining = connection.execute(
        """
        SELECT COUNT(*) FROM city_images ci
        JOIN cities c ON c.id = ci.city_id
        WHERE c.tier = ? AND ci.kind = ? AND ci.status = 'NEEDED'
        """,
        (args.tier, args.kind),
    ).fetchone()[0]
    connection.close()
    action = "validated" if args.dry_run else "imported"
    print(
        f"\n{action} {len(candidates)} / failed {failed} / "
        f"missing {len(rows) - len(candidates) - failed} / remaining {remaining}"
    )


if __name__ == "__main__":
    main()
