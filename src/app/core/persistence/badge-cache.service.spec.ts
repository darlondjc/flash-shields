import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BadgeCacheService } from './badge-cache.service';
import { DbService } from './db.service';
import { Team } from '../models/team.model';

function makeTeam(): Team {
  return {
    id: 'ts-1',
    externalIds: { thesportsdb: '1' },
    name: 'Arsenal',
    alternateNames: [],
    country: 'England',
    leagueIds: ['ts-4328'],
    badgeUrl: 'https://example.com/arsenal.png',
  };
}

// Angular's unit-test builder runs specs under jsdom, whose Blob polyfill is not recognized by
// Node's native `structuredClone` (which `fake-indexeddb` uses internally to clone values on
// insertion — see fake-indexeddb's lib/cloneValueForInsertion.js). A jsdom Blob round-tripped
// through structuredClone comes back as a plain Object, not a Blob. Node's own `buffer.Blob` is
// structured-clone-safe and is also accepted by jsdom's `URL.createObjectURL`. Loaded via a
// non-literal dynamic import specifier so TypeScript treats the result as `Promise<any>` instead
// of trying (and failing) to resolve `@types/node`, which this project does not install.
let NodeBlob: typeof Blob;

function macrotask(): Promise<void> {
  // fake-indexeddb resolves IDBRequests via setImmediate/setTimeout (a real macrotask), never via
  // microtasks alone — see fake-indexeddb's lib/scheduling.js. Awaiting one real timer tick lets a
  // pending `db.badgeBlobs.get(...)` resolve before we assert on the HTTP mock. This project is
  // zoneless (no zone.js dependency), so `fakeAsync`/`tick()` is not available here.
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('BadgeCacheService', () => {
  let service: BadgeCacheService;
  let db: DbService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    const bufferModuleId = 'buffer';
    const bufferMod = (await import(/* @vite-ignore */ bufferModuleId)) as { Blob: typeof Blob };
    NodeBlob = bufferMod.Blob;

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BadgeCacheService);
    db = TestBed.inject(DbService);
    httpMock = TestBed.inject(HttpTestingController);
    await db.badgeBlobs.clear();
  });

  afterEach(() => httpMock.verify());

  it('downloads and caches the badge on first request', async () => {
    const promise = service.getObjectUrl(makeTeam());
    await macrotask();
    const req = httpMock.expectOne('https://example.com/arsenal.png');
    // HttpTestingController's flush() does its own `instanceof Blob` check against the jsdom
    // realm's Blob, so this one must stay a plain (jsdom) Blob, unlike the seed blob in the
    // "serves from cache" test below — this path never round-trips through fake-indexeddb before
    // `URL.createObjectURL` is called (see badge-cache.service.ts: on a cache miss it calls
    // `URL.createObjectURL(blob)` on the freshly downloaded blob directly, not on a value read
    // back from `db.badgeBlobs`), so the structuredClone/jsdom-Blob mismatch never surfaces here.
    req.flush(new Blob(['fake-png-bytes']));

    const url = await promise;
    expect(url).toContain('blob:');
    const cached = await db.badgeBlobs.get('ts-1');
    expect(cached).toBeDefined();
  });

  it('serves from cache without a second HTTP request', async () => {
    await db.badgeBlobs.put({ key: 'ts-1', blob: new NodeBlob(['cached-bytes']) });
    const url = await service.getObjectUrl(makeTeam());
    expect(url).toContain('blob:');
    httpMock.expectNone('https://example.com/arsenal.png');
  });
});
