import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CrestTextRegionService } from './crest-text-region.service';
import { BadgeCacheService } from './badge-cache.service';
import { DbService } from './db.service';
import { Team } from '../models/team.model';

const { recognize, setParameters } = vi.hoisted(() => ({
  recognize: vi.fn(),
  setParameters: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn().mockResolvedValue({ setParameters, recognize }),
  PSM: { SPARSE_TEXT: '11' },
}));

class FakeImage {
  naturalWidth = 300;
  naturalHeight = 300;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'ts-1',
    externalIds: {},
    name: 'Mock FC',
    alternateNames: [],
    country: 'Testland',
    leagueIds: [],
    badgeUrl: 'https://example.com/mock.png',
    ...overrides,
  };
}

function wordResult(overrides: {
  text: string;
  confidence: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}) {
  const bbox = overrides.bbox ?? { x0: 30, y0: 60, x1: 130, y1: 100 };
  return {
    text: 'ignored-parent-text',
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [{ text: overrides.text, confidence: overrides.confidence, bbox }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('CrestTextRegionService', () => {
  let service: CrestTextRegionService;
  let db: DbService;

  beforeEach(async () => {
    vi.stubGlobal('Image', FakeImage);
    recognize.mockReset();
    setParameters.mockClear();

    TestBed.configureTestingModule({
      providers: [
        { provide: BadgeCacheService, useValue: { getObjectUrl: vi.fn().mockResolvedValue('blob:mock') } },
      ],
    });
    service = TestBed.inject(CrestTextRegionService);
    db = TestBed.inject(DbService);
    await db.crestTextRegions.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('keeps a word above the confidence and length thresholds, converted to a percent box', async () => {
    recognize.mockResolvedValueOnce({
      data: { confidence: 90, ...wordResult({ text: 'MOCK', confidence: 90, bbox: { x0: 30, y0: 60, x1: 130, y1: 100 } }) },
    });

    const boxes = await service.getRegions(makeTeam());

    expect(boxes).toEqual([{ top: 20, left: 10, width: (100 / 300) * 100, height: (40 / 300) * 100 }]);
  });

  it('drops words below the confidence threshold', async () => {
    recognize.mockResolvedValueOnce({
      data: { confidence: 90, ...wordResult({ text: 'MOCK', confidence: 40 }) },
    });

    const boxes = await service.getRegions(makeTeam());

    expect(boxes).toEqual([]);
  });

  it('drops words shorter than the minimum length (e.g. a bare "FC" suffix)', async () => {
    recognize.mockResolvedValueOnce({
      data: { confidence: 90, ...wordResult({ text: 'FC', confidence: 95 }) },
    });

    const boxes = await service.getRegions(makeTeam());

    expect(boxes).toEqual([]);
  });

  it('falls back to an inverted-colors pass when the first pass finds nothing', async () => {
    // jsdom has no real canvas 2D backend (see badge-cache.service.spec.ts for the same
    // limitation elsewhere); stub just enough of it for recognizeInverted's drawImage call.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      { filter: '', drawImage: vi.fn() } as unknown as CanvasRenderingContext2D,
    );
    recognize
      .mockResolvedValueOnce({ data: { confidence: 0, text: '', blocks: [] } })
      .mockResolvedValueOnce({ data: { confidence: 90, ...wordResult({ text: 'MOCK', confidence: 90 }) } });

    const boxes = await service.getRegions(makeTeam());

    expect(recognize).toHaveBeenCalledTimes(2);
    expect(boxes).toHaveLength(1);
  });

  it('caches the result so a second call skips OCR entirely', async () => {
    recognize.mockResolvedValueOnce({
      data: { confidence: 90, ...wordResult({ text: 'MOCK', confidence: 90 }) },
    });

    const team = makeTeam();
    const first = await service.getRegions(team);
    const second = await service.getRegions(team);

    expect(second).toEqual(first);
    expect(recognize).toHaveBeenCalledTimes(1);
  });
});
