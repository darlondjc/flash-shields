#!/usr/bin/env python3
"""Detects text on a crest image with PaddleOCR and blurs the regions found.

Usage: python3 paddle_detect_blur.py <input_path> <output_path>

Prints a one-line JSON summary to stdout: {"regionsFound": N}. Exit code is
non-zero only on a hard failure (bad input, PaddleOCR crash) — finding zero
text regions is a normal, successful outcome (crest has no readable name),
not an error.

Kept deliberately narrow: this script only does image-in, image-out text
masking. Everything else (deciding which teams need processing, Firestore,
Vercel Blob upload, the manual review gallery) lives in the Node sibling
script (game-badges.mjs), which calls this once per crest as a subprocess.
"""

import json
import re
import sys

from PIL import Image, ImageDraw, ImageFilter
from paddleocr import PaddleOCR

MIN_CONFIDENCE = 0.6
MIN_TEXT_LENGTH = 3
HAS_LETTER = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]")
# Padding around each detected polygon before blurring, as a fraction of its
# own size (scaled outward from its centroid) — covers anti-aliased letter
# edges the polygon just missed, without ballooning to the full bounding box.
POLYGON_PADDING_RATIO = 0.15
# Softens the mask edge so the blurred patch doesn't have a hard border.
MASK_FEATHER_RADIUS = 3

_ocr = None


def get_ocr():
    global _ocr
    if _ocr is None:
        # angle_cls handles rotated (not just curved) text; PP-OCR's own
        # detector already finds text of any orientation/shape, unlike
        # Tesseract's line-finding — no manual polar-unwrap trick needed.
        _ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _ocr


def detect_polygons(image_path):
    result = get_ocr().ocr(image_path, cls=True)
    lines = result[0] if result and result[0] else []
    polygons = []
    for polygon, (text, confidence) in lines:
        if confidence < MIN_CONFIDENCE:
            continue
        if len(text.strip()) < MIN_TEXT_LENGTH:
            continue
        if not HAS_LETTER.search(text):
            continue
        polygons.append([(point[0], point[1]) for point in polygon])
    return polygons


def pad_polygon(polygon, ratio):
    cx = sum(x for x, _ in polygon) / len(polygon)
    cy = sum(y for _, y in polygon) / len(polygon)
    scale = 1 + ratio
    return [(cx + (x - cx) * scale, cy + (y - cy) * scale) for x, y in polygon]


def blur_polygons(image_path, polygons, output_path):
    image = Image.open(image_path).convert("RGBA")
    for polygon in polygons:
        padded = pad_polygon(polygon, POLYGON_PADDING_RATIO)
        xs = [x for x, _ in padded]
        ys = [y for _, y in padded]
        px0, py0 = max(0, int(min(xs))), max(0, int(min(ys)))
        px1, py1 = min(image.width, int(max(xs)) + 1), min(image.height, int(max(ys)) + 1)
        if px1 <= px0 or py1 <= py0:
            continue

        region = image.crop((px0, py0, px1, py1))
        radius = max(6, min(region.width, region.height) * 0.35)
        blurred = region.filter(ImageFilter.GaussianBlur(radius=radius))

        # Blur only the pixels inside the (padded) text polygon itself, not
        # its full axis-aligned bounding box — for curved/arched text (e.g.
        # a name following a crest's rim) that box can be much bigger than
        # the actual glyphs, over-blurring unrelated crest artwork.
        mask = Image.new("L", region.size, 0)
        ImageDraw.Draw(mask).polygon([(x - px0, y - py0) for x, y in padded], fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(radius=MASK_FEATHER_RADIUS))

        image.paste(Image.composite(blurred, region, mask), (px0, py0))
    image.save(output_path, "PNG")


def main():
    if len(sys.argv) != 3:
        print("usage: paddle_detect_blur.py <input_path> <output_path>", file=sys.stderr)
        sys.exit(2)
    input_path, output_path = sys.argv[1], sys.argv[2]

    polygons = detect_polygons(input_path)
    if polygons:
        blur_polygons(input_path, polygons, output_path)
    print(json.dumps({"regionsFound": len(polygons)}))


if __name__ == "__main__":
    main()
