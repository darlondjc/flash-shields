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

from PIL import Image, ImageFilter
from paddleocr import PaddleOCR

MIN_CONFIDENCE = 0.6
MIN_TEXT_LENGTH = 3
HAS_LETTER = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]")
# Padding around each detected box before blurring, as a fraction of the
# box's own size — covers anti-aliased letter edges the polygon just missed.
BOX_PADDING_RATIO = 0.15

_ocr = None


def get_ocr():
    global _ocr
    if _ocr is None:
        # angle_cls handles rotated (not just curved) text; PP-OCR's own
        # detector already finds text of any orientation/shape, unlike
        # Tesseract's line-finding — no manual polar-unwrap trick needed.
        _ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _ocr


def detect_boxes(image_path):
    result = get_ocr().ocr(image_path, cls=True)
    lines = result[0] if result and result[0] else []
    boxes = []
    for polygon, (text, confidence) in lines:
        if confidence < MIN_CONFIDENCE:
            continue
        if len(text.strip()) < MIN_TEXT_LENGTH:
            continue
        if not HAS_LETTER.search(text):
            continue
        xs = [point[0] for point in polygon]
        ys = [point[1] for point in polygon]
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
    return boxes


def pad_box(box, width, height):
    x0, y0, x1, y1 = box
    pad_x = (x1 - x0) * BOX_PADDING_RATIO
    pad_y = (y1 - y0) * BOX_PADDING_RATIO
    return (
        max(0, int(x0 - pad_x)),
        max(0, int(y0 - pad_y)),
        min(width, int(x1 + pad_x)),
        min(height, int(y1 + pad_y)),
    )


def blur_boxes(image_path, boxes, output_path):
    image = Image.open(image_path).convert("RGBA")
    for box in boxes:
        px0, py0, px1, py1 = pad_box(box, image.width, image.height)
        if px1 <= px0 or py1 <= py0:
            continue
        region = image.crop((px0, py0, px1, py1))
        radius = max(6, min(region.width, region.height) * 0.35)
        blurred = region.filter(ImageFilter.GaussianBlur(radius=radius))
        image.paste(blurred, (px0, py0))
    image.save(output_path, "PNG")


def main():
    if len(sys.argv) != 3:
        print("usage: paddle_detect_blur.py <input_path> <output_path>", file=sys.stderr)
        sys.exit(2)
    input_path, output_path = sys.argv[1], sys.argv[2]

    boxes = detect_boxes(input_path)
    if boxes:
        blur_boxes(input_path, boxes, output_path)
    print(json.dumps({"regionsFound": len(boxes)}))


if __name__ == "__main__":
    main()
