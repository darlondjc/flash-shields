import { Injectable, inject } from '@angular/core';
import { createWorker, PSM, RecognizeResult, Word as TesseractWord, Worker as TesseractWorker } from 'tesseract.js';
import { DbService } from './db.service';
import { BadgeCacheService } from './badge-cache.service';
import { Team } from '../models/team.model';
import { CrestTextBox } from '../models/crest-text-box.model';

const MIN_CONFIDENCE = 60;
const MIN_TEXT_LENGTH = 3;
const HAS_LETTER = /[A-Za-zÀ-ÖØ-öø-ÿ]/;

// Self-hosted so recognition keeps working offline once this app (a PWA) has
// been opened once — tesseract.js defaults to fetching these from a CDN.
const TESSERACT_ASSETS_PATH = '/tesseract';

// How much of the crest's rim (as a fraction of its half-width/half-height)
// is scanned for curved text — club names are almost always printed close
// to the outer edge, not near the center emblem.
const RIM_INNER_RADIUS_RATIO = 0.55;
const RIM_OUTER_RADIUS_RATIO = 0.95;
// Resolution of one full lap of the unwrapped rim strip. 960 is a shade
// over 1px per degree; 64 radial steps is enough to keep a couple of text
// sizes legible without unwrapping at wasteful resolution.
const UNWRAP_FULL_TURN_STEPS = 960;
const UNWRAP_RADIAL_STEPS = 64;
// An arced name can straddle the seam where the unwrap wraps back to its
// start (bearing 0), which would otherwise cut the word into two pieces on
// opposite ends of the strip. Sampling half a lap past the seam duplicates
// that stretch at the tail end of the strip, so any arc up to 180° long
// always appears intact somewhere in the image, never split.
const UNWRAP_WRAP_MARGIN_STEPS = UNWRAP_FULL_TURN_STEPS / 2;
const UNWRAP_TOTAL_STEPS = UNWRAP_FULL_TURN_STEPS + UNWRAP_WRAP_MARGIN_STEPS;

interface Dimensions {
  width: number;
  height: number;
}

interface RimMapping {
  cx: number;
  cy: number;
  rInner: number;
  rOuter: number;
  fullTurnSteps: number;
  totalSteps: number;
  radialSteps: number;
}

@Injectable({ providedIn: 'root' })
export class CrestTextRegionService {
  private db = inject(DbService);
  private badgeCache = inject(BadgeCacheService);

  private workerPromise: Promise<TesseractWorker> | null = null;

  // Detects the region(s) of a team's crest that contain the club name
  // printed as part of the artwork, so callers can visually blur just that
  // area. Result is cached in IndexedDB — OCR only ever runs once per team.
  async getRegions(team: Team): Promise<CrestTextBox[]> {
    const cached = await this.db.crestTextRegions.get(team.id);
    if (cached) return cached.boxes;

    const boxes = await this.detect(team);
    await this.db.crestTextRegions.put({ teamId: team.id, boxes });
    return boxes;
  }

  private async detect(team: Team): Promise<CrestTextBox[]> {
    const objectUrl = await this.badgeCache.getObjectUrl(team.id, team.badgeUrl);
    const [worker, image] = await Promise.all([this.getWorker(), this.loadImage(objectUrl)]);
    const dimensions = { width: image.naturalWidth, height: image.naturalHeight };

    const boxes: CrestTextBox[] = [];

    const straight = await this.recognizeWithInversionFallback(worker, image, dimensions.width, dimensions.height);
    boxes.push(...this.extractBoxes(straight, dimensions));

    // Club crests very often print the name curved along the rim rather
    // than horizontally (e.g. "MANCHESTER" arcing over the top of the
    // badge) — Tesseract's line-finding assumes near-straight baselines
    // and simply never sees that as text. Unwrap the rim into a straight
    // strip (polar → Cartesian) and OCR that separately.
    const mapping = this.buildRimMapping(dimensions);
    const unwrapped = this.buildUnwrappedRim(image, mapping);
    if (unwrapped) {
      const curved = await this.recognizeWithInversionFallback(worker, unwrapped, mapping.totalSteps, mapping.radialSteps);
      boxes.push(...this.extractBoxes(curved, dimensions, mapping));
    }

    return boxes;
  }

  private async recognizeWithInversionFallback(
    worker: TesseractWorker,
    source: CanvasImageSource,
    width: number,
    height: number,
  ): Promise<RecognizeResult> {
    const normal = await worker.recognize(source, {}, { blocks: true });
    // Tesseract's binarization assumes dark text on a light background.
    // Crests very often do the opposite — the club name printed in white
    // over a colored band — which a plain pass detects nothing for. Only
    // pay for a second, inverted-colors pass when the first one came back
    // empty.
    if (normal.data.confidence > 0) return normal;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.filter = 'invert(1)';
    ctx.drawImage(source, 0, 0);
    return worker.recognize(canvas, {}, { blocks: true });
  }

  private extractBoxes(result: RecognizeResult, dimensions: Dimensions, rimMapping?: RimMapping): CrestTextBox[] {
    const words: TesseractWord[] = (result.data.blocks ?? [])
      .flatMap(block => block.paragraphs)
      .flatMap(paragraph => paragraph.lines)
      .flatMap(line => line.words)
      .filter(word => word.confidence >= MIN_CONFIDENCE
        && word.text.trim().length >= MIN_TEXT_LENGTH
        && HAS_LETTER.test(word.text));

    return rimMapping
      ? words.map(word => this.rimBboxToPercentBox(word.bbox, rimMapping, dimensions))
      : words.map(word => this.toPercentBox(word.bbox, dimensions));
  }

  private toPercentBox(
    bbox: { x0: number; y0: number; x1: number; y1: number },
    dimensions: Dimensions,
  ): CrestTextBox {
    return {
      top: (bbox.y0 / dimensions.height) * 100,
      left: (bbox.x0 / dimensions.width) * 100,
      width: ((bbox.x1 - bbox.x0) / dimensions.width) * 100,
      height: ((bbox.y1 - bbox.y0) / dimensions.height) * 100,
    };
  }

  private buildRimMapping(dimensions: Dimensions): RimMapping {
    const baseRadius = Math.min(dimensions.width, dimensions.height) / 2;
    return {
      cx: dimensions.width / 2,
      cy: dimensions.height / 2,
      rInner: baseRadius * RIM_INNER_RADIUS_RATIO,
      rOuter: baseRadius * RIM_OUTER_RADIUS_RATIO,
      fullTurnSteps: UNWRAP_FULL_TURN_STEPS,
      totalSteps: UNWRAP_TOTAL_STEPS,
      radialSteps: UNWRAP_RADIAL_STEPS,
    };
  }

  // Polar → Cartesian resample: bearing 0 = top of the crest, increasing
  // clockwise, which is how a curved club name is normally set — so reading
  // the unwrapped strip left-to-right reads the arc in its natural order.
  // The radial axis runs from the outer rim (y=0, top of the strip) inward
  // (y=radialSteps, bottom of the strip), matching how an outward-facing
  // glyph's top-to-bottom stroke naturally reads once straightened.
  private buildUnwrappedRim(image: HTMLImageElement, mapping: RimMapping): HTMLCanvasElement | null {
    try {
      const source = document.createElement('canvas');
      source.width = image.naturalWidth;
      source.height = image.naturalHeight;
      const sctx = source.getContext('2d');
      if (!sctx) return null;
      sctx.drawImage(image, 0, 0);
      const sourceData = sctx.getImageData(0, 0, source.width, source.height);

      const { cx, cy, rInner, rOuter, fullTurnSteps, totalSteps, radialSteps } = mapping;
      const dest = document.createElement('canvas');
      dest.width = totalSteps;
      dest.height = radialSteps;
      const dctx = dest.getContext('2d');
      if (!dctx) return null;
      const destData = dctx.createImageData(totalSteps, radialSteps);

      for (let x = 0; x < totalSteps; x++) {
        const bearing = (x / fullTurnSteps) * Math.PI * 2;
        const sin = Math.sin(bearing);
        const cos = Math.cos(bearing);
        for (let y = 0; y < radialSteps; y++) {
          const r = rOuter - (y / radialSteps) * (rOuter - rInner);
          const sx = Math.round(cx + r * sin);
          const sy = Math.round(cy - r * cos);
          const destIndex = (y * totalSteps + x) * 4;
          if (sx < 0 || sx >= source.width || sy < 0 || sy >= source.height) {
            destData.data[destIndex + 3] = 0;
            continue;
          }
          const srcIndex = (sy * source.width + sx) * 4;
          destData.data[destIndex] = sourceData.data[srcIndex];
          destData.data[destIndex + 1] = sourceData.data[srcIndex + 1];
          destData.data[destIndex + 2] = sourceData.data[srcIndex + 2];
          destData.data[destIndex + 3] = sourceData.data[srcIndex + 3];
        }
      }
      dctx.putImageData(destData, 0, 0);
      return dest;
    } catch {
      // Tainted canvas (rare CORS-fallback badge URL) or no canvas support
      // (e.g. under test) — the curved-text pass is simply skipped; the
      // straight/inverted passes over the original image still run.
      return null;
    }
  }

  private rimBboxToPercentBox(
    bbox: { x0: number; y0: number; x1: number; y1: number },
    mapping: RimMapping,
    dimensions: Dimensions,
  ): CrestTextBox {
    const { cx, cy, rInner, rOuter, fullTurnSteps, radialSteps } = mapping;
    const toPoint = (x: number, y: number) => {
      const bearing = (x / fullTurnSteps) * Math.PI * 2;
      const r = rOuter - (y / radialSteps) * (rOuter - rInner);
      return { px: cx + r * Math.sin(bearing), py: cy - r * Math.cos(bearing) };
    };

    // A wide angular span curves — sample several points along it, not
    // just its two ends, so the resulting axis-aligned box fully contains
    // the arc instead of cutting its middle off.
    const steps = 6;
    const points = Array.from({ length: steps + 1 }, (_, i) => bbox.x0 + ((bbox.x1 - bbox.x0) * i) / steps)
      .flatMap(x => [toPoint(x, bbox.y0), toPoint(x, bbox.y1)]);

    const xs = points.map(p => p.px);
    const ys = points.map(p => p.py);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      top: (minY / dimensions.height) * 100,
      left: (minX / dimensions.width) * 100,
      width: ((maxX - minX) / dimensions.width) * 100,
      height: ((maxY - minY) / dimensions.height) * 100,
    };
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`CrestTextRegionService: failed to load image (${url})`));
      image.src = url;
    });
  }

  private getWorker(): Promise<TesseractWorker> {
    if (!this.workerPromise) {
      this.workerPromise = createWorker('eng', 1, {
        workerPath: `${TESSERACT_ASSETS_PATH}/worker.min.js`,
        corePath: TESSERACT_ASSETS_PATH,
        langPath: `${TESSERACT_ASSETS_PATH}/`,
        gzip: true,
      }).then(async worker => {
        // Crests are mostly graphics with a small strip of sparse text, not
        // a document page — the default "fully automatic" segmentation
        // often decides there's no text at all. SPARSE_TEXT looks for text
        // in no particular layout, which fits this use case much better.
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        return worker;
      });
    }
    return this.workerPromise;
  }
}
