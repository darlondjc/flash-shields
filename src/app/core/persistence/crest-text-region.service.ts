import { Injectable, inject } from '@angular/core';
import { createWorker, PSM, RecognizeResult, Worker as TesseractWorker } from 'tesseract.js';
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

    const normal = await worker.recognize(image, {}, { blocks: true });

    // Tesseract's binarization assumes dark text on a light background.
    // Crests very often do the opposite — the club name printed in white
    // over a colored band — which a plain pass detects nothing for. Only
    // pay for a second, inverted-colors pass when the first one came back
    // empty.
    const result = normal.data.confidence > 0 ? normal : await this.recognizeInverted(worker, image, dimensions);

    const words = (result.data.blocks ?? [])
      .flatMap(block => block.paragraphs)
      .flatMap(paragraph => paragraph.lines)
      .flatMap(line => line.words);

    return words
      .filter(word => word.confidence >= MIN_CONFIDENCE
        && word.text.trim().length >= MIN_TEXT_LENGTH
        && HAS_LETTER.test(word.text))
      .map(word => this.toPercentBox(word.bbox, dimensions));
  }

  private recognizeInverted(
    worker: TesseractWorker,
    image: HTMLImageElement,
    dimensions: { width: number; height: number },
  ): Promise<RecognizeResult> {
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext('2d')!;
    ctx.filter = 'invert(1)';
    ctx.drawImage(image, 0, 0);
    return worker.recognize(canvas, {}, { blocks: true });
  }

  private toPercentBox(
    bbox: { x0: number; y0: number; x1: number; y1: number },
    dimensions: { width: number; height: number },
  ): CrestTextBox {
    return {
      top: (bbox.y0 / dimensions.height) * 100,
      left: (bbox.x0 / dimensions.width) * 100,
      width: ((bbox.x1 - bbox.x0) / dimensions.width) * 100,
      height: ((bbox.y1 - bbox.y0) / dimensions.height) * 100,
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
