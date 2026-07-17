#!/usr/bin/env python3
"""Diagnostic sibling of paddle_detect_blur.py: runs PaddleOCR on an image
with NO confidence/length filtering and prints everything it found, plus
image dimensions. Only used to inspect why detection fails/succeeds on a
given crest — never called by game-badges.mjs.

Usage: python3 paddle_diagnose.py <image_url_or_path> [...]
"""

import json
import sys
import urllib.request

from PIL import Image
from paddleocr import PaddleOCR

_ocr = None


def get_ocr():
    global _ocr
    if _ocr is None:
        _ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _ocr


def load_image_path(source, tmp_path):
    if source.startswith("http://") or source.startswith("https://"):
        urllib.request.urlretrieve(source, tmp_path)
        return tmp_path
    return source


def diagnose(source):
    tmp_path = "/tmp/paddle-diagnose-input.png"
    path = load_image_path(source, tmp_path)
    with Image.open(path) as img:
        width, height = img.size

    result = get_ocr().ocr(path, cls=True)
    lines = result[0] if result and result[0] else []
    detections = []
    for polygon, (text, confidence) in lines:
        xs = [p[0] for p in polygon]
        ys = [p[1] for p in polygon]
        detections.append({
            "text": text,
            "confidence": round(confidence, 4),
            "polygon": [[round(x, 1), round(y, 1)] for x, y in polygon],
            "bbox": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)],
        })

    print(json.dumps({
        "source": source,
        "imageSize": [width, height],
        "detectionCount": len(detections),
        "detections": detections,
    }, indent=2, ensure_ascii=False))


def main():
    if len(sys.argv) < 2:
        print("usage: paddle_diagnose.py <image_url_or_path> [...]", file=sys.stderr)
        sys.exit(2)
    for source in sys.argv[1:]:
        diagnose(source)


if __name__ == "__main__":
    main()
