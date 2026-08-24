"""Render deterministic Tier-1 city locator maps from licensed ADM1 boundary data.

The renderer uses exact database coordinates and vector boundaries. It intentionally avoids
generative-image models and pre-fetched web-map tiles, neither of which is appropriate for
factual locator maps. Workers produce files and a manifest; a separate importer writes SQLite.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parents[1]
DEFAULT_DB = ROOT / "locz_cities.db"
DATA_DIR = ROOT / "data" / "geoboundaries"
GEOJSON_PATH = DATA_DIR / "geoBoundaries-IND-ADM1_simplified.geojson"
MANIFEST_PATH = ROOT / "manifests" / "tier1-maps.json"
GEOJSON_URL = (
    "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IND/"
    "ADM1/geoBoundaries-IND-ADM1_simplified.geojson"
)
EXPECTED_BOUNDARY_SHA256 = "4c63fe43294a391e8f2de4e9f86f3edb60f8688275b9fee90c61fb2aa0c26061"
METADATA_URL = "https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/"

CANVAS = 1600
SCALE = 2
FONT_REGULAR = REPO_ROOT / "apps" / "mobile" / "assets" / "fonts" / "Inter-Regular.ttf"
FONT_MEDIUM = REPO_ROOT / "apps" / "mobile" / "assets" / "fonts" / "Inter-Medium.ttf"
FONT_BOLD = REPO_ROOT / "apps" / "mobile" / "assets" / "fonts" / "Inter-Bold.ttf"

STATE_CODES = {
    "Gujarat": "IN-GJ",
    "Karnataka": "IN-KA",
    "Tamil Nadu": "IN-TN",
    "Delhi": "IN-DL",
    "Telangana": "IN-TG",
    "West Bengal": "IN-WB",
    "Maharashtra": "IN-MH",
}

COLORS = {
    "canvas": "#F7F5EF",
    "map_fill": "#DCE7E2",
    "map_edge": "#80978E",
    "selected": "#0E7C5A",
    "selected_edge": "#0A4A38",
    "selected_highlight": "#42A185",
    "coral": "#F2603F",
    "coral_dark": "#B93D27",
    "text": "#0A362C",
    "muted": "#536861",
    "panel_border": "#C9D7D1",
    "white": "#FFFFFF",
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--tier", type=int, choices=(1, 2), default=1)
    parser.add_argument("--force-download", action="store_true")
    return parser.parse_args()


def scaled_font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    if not path.exists():
        raise FileNotFoundError(f"Bundled font is missing: {path}")
    return ImageFont.truetype(str(path), size * SCALE)


def download_boundaries(force: bool = False) -> None:
    if GEOJSON_PATH.exists() and not force:
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        GEOJSON_URL,
        headers={"User-Agent": "LocZCityContent/1.0 (+https://locz.in)"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        GEOJSON_PATH.write_bytes(response.read())
    validate_boundary_hash()


def validate_boundary_hash() -> None:
    digest = hashlib.sha256(GEOJSON_PATH.read_bytes()).hexdigest()
    if digest != EXPECTED_BOUNDARY_SHA256:
        raise ValueError(
            f"Boundary data hash {digest} does not match pinned source {EXPECTED_BOUNDARY_SHA256}"
        )


def albers(lon: float, lat: float) -> tuple[float, float]:
    """India-centred Albers equal-area projection in normalized spherical units."""
    phi = math.radians(lat)
    lam = math.radians(lon)
    phi_1, phi_2 = math.radians(12), math.radians(30)
    phi_0, lam_0 = math.radians(20), math.radians(79)
    n = 0.5 * (math.sin(phi_1) + math.sin(phi_2))
    c = math.cos(phi_1) ** 2 + 2 * n * math.sin(phi_1)
    rho = math.sqrt(c - 2 * n * math.sin(phi)) / n
    rho_0 = math.sqrt(c - 2 * n * math.sin(phi_0)) / n
    theta = n * (lam - lam_0)
    return rho * math.sin(theta), rho_0 - rho * math.cos(theta)


def iter_rings(geometry: dict):
    if geometry["type"] == "Polygon":
        yield geometry["coordinates"]
    elif geometry["type"] == "MultiPolygon":
        yield from geometry["coordinates"]
    else:
        raise ValueError(f"Unsupported geometry: {geometry['type']}")


def point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = previous[:2]
        x2, y2 = current[:2]
        crosses = (y1 > lat) != (y2 > lat)
        if crosses:
            intersect_x = (x2 - x1) * (lat - y1) / (y2 - y1) + x1
            if lon < intersect_x:
                inside = not inside
        previous = current
    return inside


def point_in_feature(lon: float, lat: float, feature: dict) -> bool:
    for polygon in iter_rings(feature["geometry"]):
        if point_in_ring(lon, lat, polygon[0]) and not any(
            point_in_ring(lon, lat, hole) for hole in polygon[1:]
        ):
            return True
    return False


def projected_bounds(features: list[dict]) -> tuple[float, float, float, float]:
    points = []
    for feature in features:
        for polygon in iter_rings(feature["geometry"]):
            points.extend(albers(lon, lat) for lon, lat, *_ in polygon[0])
    xs, ys = zip(*points)
    return min(xs), min(ys), max(xs), max(ys)


def pixel_transform(bounds: tuple[float, float, float, float]):
    min_x, min_y, max_x, max_y = bounds
    left, top, right, bottom = (210, 165, 1390, 1375)
    width, height = right - left, bottom - top
    factor = min(width / (max_x - min_x), height / (max_y - min_y))
    offset_x = left + (width - (max_x - min_x) * factor) / 2
    offset_y = top + (height - (max_y - min_y) * factor) / 2

    def convert(lon: float, lat: float) -> tuple[int, int]:
        x, y = albers(lon, lat)
        return (
            round((offset_x + (x - min_x) * factor) * SCALE),
            round((offset_y + (max_y - y) * factor) * SCALE),
        )

    return convert


def draw_feature(
    draw: ImageDraw.ImageDraw,
    feature: dict,
    convert,
    fill: str,
    outline: str,
    width: int,
) -> None:
    for polygon in iter_rings(feature["geometry"]):
        exterior = [convert(lon, lat) for lon, lat, *_ in polygon[0]]
        draw.polygon(exterior, fill=fill)
        draw.line(exterior, fill=outline, width=width * SCALE, joint="curve")
        for hole in polygon[1:]:
            points = [convert(lon, lat) for lon, lat, *_ in hole]
            draw.polygon(points, fill=COLORS["canvas"])
            draw.line(points, fill=outline, width=max(1, width - 1) * SCALE, joint="curve")


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> int:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0]


def label_position(pin_x: int, pin_y: int, width: int, height: int) -> tuple[int, int]:
    margin = 200 * SCALE
    gap_x, gap_y = 55 * SCALE, 35 * SCALE
    candidates = [
        (pin_x + gap_x, pin_y - height - gap_y),
        (pin_x + gap_x, pin_y + gap_y),
        (pin_x - width - gap_x, pin_y - height - gap_y),
        (pin_x - width - gap_x, pin_y + gap_y),
    ]
    for x, y in candidates:
        if margin <= x <= CANVAS * SCALE - margin - width and margin <= y <= 1380 * SCALE - height:
            return x, y
    return margin, 1120 * SCALE


def render_map(city: sqlite3.Row, features: list[dict], bounds) -> dict:
    state_code = STATE_CODES.get(city["state_ut"])
    if not state_code:
        raise ValueError(f"No ADM1 mapping for {city['state_ut']}")
    selected = next(
        (item for item in features if item["properties"].get("shapeISO") == state_code),
        None,
    )
    if selected is None:
        raise ValueError(f"Boundary feature {state_code} is missing")
    if not point_in_feature(city["longitude"], city["latitude"], selected):
        raise ValueError(
            f"{city['city_name']} coordinate is outside the selected {city['state_ut']} boundary"
        )

    size = CANVAS * SCALE
    image = Image.new("RGB", (size, size), COLORS["canvas"])
    draw = ImageDraw.Draw(image)
    convert = pixel_transform(bounds)

    # Restrained editorial background details, kept outside the geography.
    draw.ellipse((1040 * SCALE, -260 * SCALE, 1800 * SCALE, 500 * SCALE), outline="#E5DDD2", width=2 * SCALE)
    draw.ellipse((1160 * SCALE, -140 * SCALE, 1700 * SCALE, 400 * SCALE), outline="#E9E3D9", width=2 * SCALE)

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    for feature in features:
        draw_feature(shadow_draw, feature, convert, "#0A4A3830", "#0A4A3800", 1)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18 * SCALE))
    image.paste(shadow, (0, 12 * SCALE), shadow)
    draw = ImageDraw.Draw(image)

    for feature in features:
        draw_feature(draw, feature, convert, COLORS["map_fill"], COLORS["map_edge"], 2)
    draw_feature(draw, selected, convert, COLORS["selected"], COLORS["selected_edge"], 6)

    font_eyebrow = scaled_font(FONT_BOLD, 22)
    font_city = scaled_font(FONT_BOLD, 40)
    font_state = scaled_font(FONT_MEDIUM, 24)
    font_coords = scaled_font(FONT_REGULAR, 20)
    font_attribution = scaled_font(FONT_MEDIUM, 18)
    font_code = scaled_font(FONT_BOLD, 20)

    draw.ellipse((112 * SCALE, 112 * SCALE, 126 * SCALE, 126 * SCALE), fill=COLORS["coral"])
    draw.text((140 * SCALE, 102 * SCALE), "CITY IN INDIA", font=font_eyebrow, fill=COLORS["selected"])

    code_width = text_width(draw, state_code, font_code) + 42 * SCALE
    code_box = (CANVAS * SCALE - 112 * SCALE - code_width, 96 * SCALE, CANVAS * SCALE - 112 * SCALE, 144 * SCALE)
    draw.rounded_rectangle(code_box, radius=24 * SCALE, fill="#FFFFFFE8", outline=COLORS["panel_border"], width=2 * SCALE)
    draw.text((code_box[0] + 21 * SCALE, 107 * SCALE), state_code, font=font_code, fill=COLORS["muted"])

    pin_x, pin_y = convert(city["longitude"], city["latitude"])
    halo = 46 * SCALE
    draw.ellipse((pin_x - halo, pin_y - halo, pin_x + halo, pin_y + halo), fill="#FFFFFFDD")
    draw.line((pin_x, pin_y, pin_x, pin_y + 55 * SCALE), fill=COLORS["coral_dark"], width=8 * SCALE)
    radius = 31 * SCALE
    draw.ellipse((pin_x - radius, pin_y - radius, pin_x + radius, pin_y + radius), fill=COLORS["coral"], outline=COLORS["coral_dark"], width=5 * SCALE)
    dot = 10 * SCALE
    draw.ellipse((pin_x - dot, pin_y - dot, pin_x + dot, pin_y + dot), fill=COLORS["white"])

    city_text_width = text_width(draw, city["city_name"], font_city)
    state_text_width = text_width(draw, city["state_ut"], font_state)
    coordinate_text = f"{city['latitude']:.4f}° N  ·  {city['longitude']:.4f}° E"
    coordinate_width = text_width(draw, coordinate_text, font_coords)
    panel_width = max(city_text_width, state_text_width, coordinate_width) + 56 * SCALE
    panel_height = 154 * SCALE
    panel_x, panel_y = label_position(pin_x, pin_y, panel_width, panel_height)

    connection_x = panel_x if panel_x > pin_x else panel_x + panel_width
    connection_y = panel_y + panel_height // 2
    draw.line((pin_x, pin_y, connection_x, connection_y), fill=COLORS["selected_edge"], width=3 * SCALE)

    panel_shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(panel_shadow)
    shadow_draw.rounded_rectangle(
        (panel_x, panel_y + 8 * SCALE, panel_x + panel_width, panel_y + panel_height + 8 * SCALE),
        radius=24 * SCALE,
        fill="#0A4A3824",
    )
    panel_shadow = panel_shadow.filter(ImageFilter.GaussianBlur(14 * SCALE))
    image.paste(panel_shadow, (0, 0), panel_shadow)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (panel_x, panel_y, panel_x + panel_width, panel_y + panel_height),
        radius=24 * SCALE,
        fill=COLORS["white"],
        outline=COLORS["panel_border"],
        width=2 * SCALE,
    )
    text_x = panel_x + 28 * SCALE
    draw.text((text_x, panel_y + 18 * SCALE), city["city_name"], font=font_city, fill=COLORS["text"])
    draw.text((text_x, panel_y + 70 * SCALE), city["state_ut"], font=font_state, fill=COLORS["muted"])
    draw.text((text_x, panel_y + 112 * SCALE), coordinate_text, font=font_coords, fill=COLORS["muted"])

    attribution = "Boundary data: geoBoundaries / DataMeet · CC BY 2.5 IN · Indicative boundaries"
    draw.text((112 * SCALE, 1520 * SCALE), attribution, font=font_attribution, fill=COLORS["muted"])

    image = image.resize((CANVAS, CANVAS), Image.Resampling.LANCZOS)
    output = ROOT / "images" / city["city_slug"] / f"map-{city['id']}.webp"
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="WEBP", quality=93, method=6, exact=True)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    boundary_digest = hashlib.sha256(GEOJSON_PATH.read_bytes()).hexdigest()
    return {
        "id": city["id"],
        "city": city["city_name"],
        "state": city["state_ut"],
        "latitude": city["latitude"],
        "longitude": city["longitude"],
        "kind": "MAP",
        "storage_url": output.relative_to(ROOT).as_posix(),
        "source_url": GEOJSON_URL,
        "metadata_url": METADATA_URL,
        "data_url": GEOJSON_URL,
        "provider": "geoboundaries",
        "source": "geoBoundaries gbOpen IND ADM1 — DataMeet India community / Election Commission of India",
        "license": "Creative Commons Attribution 2.5 India (CC BY 2.5 IN)",
        "attribution": "DataMeet India community and Election Commission of India, via geoBoundaries (IND-ADM1-1811400)",
        "attribution_required": True,
        "width": CANVAS,
        "height": CANVAS,
        "content_hash": digest,
        "status": "GENERATED",
        "alt_text": f"Map of India highlighting {city['state_ut']}, with {city['city_name']} marked.",
        "boundary_data_hash": boundary_digest,
        "boundary_metadata_year": "2011",
        "boundary_build_date": "2023-12-12",
        "boundary_caveat": "Indicative geometry with mixed administrative vintage; not proof of 2026 legal currency.",
    }


def main() -> None:
    args = arguments()
    download_boundaries(args.force_download)
    validate_boundary_hash()
    data = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))
    features = data["features"]
    bounds = projected_bounds(features)

    connection = sqlite3.connect(args.db.resolve())
    connection.row_factory = sqlite3.Row
    rows = connection.execute(
        """
        SELECT ci.id, c.city_name, c.city_slug, c.state_ut, c.latitude, c.longitude
        FROM city_images ci
        JOIN cities c ON c.id = ci.city_id
        WHERE c.tier = ? AND ci.kind = 'MAP' AND ci.status = 'NEEDED'
        ORDER BY c.city_name
        """,
        (args.tier,),
    ).fetchall()
    connection.close()

    manifest = []
    for city in rows:
        item = render_map(city, features, bounds)
        manifest.append(item)
        print(f"OK    {item['city']}: {item['width']}x{item['height']} {item['content_hash'][:12]}")

    if not manifest:
        print("No NEEDED map rows; existing manifest was left unchanged.")
        return
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nrendered {len(manifest)} maps; manifest: {MANIFEST_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
