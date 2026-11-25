import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSheetRow,
  DEFAULT_PERMANENT_SHEET_GID,
  DEFAULT_PERMANENT_SPREADSHEET_ID,
  filterNewEntriesForSheet,
  getPermanentSheetConfig,
  parseServiceAccountFromEnv,
  SheetSyncError,
  validateSyncEntries,
  type ValidatedSyncTrade,
} from './sheetsSync.ts';

test('getPermanentSheetConfig defaults to the configured Spreadsheet ID and GID', () => {
  const cfg = getPermanentSheetConfig({});
  assert.equal(cfg.spreadsheetId, DEFAULT_PERMANENT_SPREADSHEET_ID);
  assert.equal(cfg.sheetGid, DEFAULT_PERMANENT_SHEET_GID);
  assert.equal(
    cfg.spreadsheetUrl,
    `https://docs.google.com/spreadsheets/d/${DEFAULT_PERMANENT_SPREADSHEET_ID}/edit#gid=${DEFAULT_PERMANENT_SHEET_GID}`
  );
  assert.equal(cfg.credentials, null);
});

test('parseServiceAccountFromEnv parses JSON env and normalizes escaped newlines', () => {
  const creds = parseServiceAccountFromEnv({
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: 'tracker@example.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nMOCKKEY\\n-----END PRIVATE KEY-----\\n',
    }),
  });
  assert.ok(creds);
  assert.equal(creds.clientEmail, 'tracker@example.iam.gserviceaccount.com');
  assert.ok(creds.privateKey.includes('\nMOCKKEY\n'));
});

test('parseServiceAccountFromEnv throws on malformed JSON', () => {
  assert.throws(
    () => parseServiceAccountFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: '{not-valid-json' }),
    SheetSyncError
  );
});

test('validateSyncEntries accepts positive profits, negative losses, and null capital', () => {
  const validated = validateSyncEntries([
    {
      id: 'TRD-1001',
      tradeDate: '2026-11-20',
      myProfit: 12500.5,
      capitalUsed: 100000,
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
    },
    {
      id: 'TRD-1002',
      tradeDate: '2026-11-21',
      myProfit: -4200,
      capitalUsed: null,
      createdAt: '2026-11-21T10:00:00.000Z',
      updatedAt: '2026-11-21T10:00:00.000Z',
    },
  ]);

  assert.equal(validated.length, 2);
  assert.equal(validated[0].myProfit, 12500.5);
  assert.equal(validated[1].myProfit, -4200);
  assert.equal(validated[1].capitalUsed, null);
  assert.deepEqual(buildSheetRow(validated[1]).slice(0, 4), ['TRD-1002', '2026-11-21', -4200, '']);
});

test('validateSyncEntries rejects formula-prefixed IDs, zero profit, and invalid calendar dates', () => {
  assert.throws(
    () =>
      validateSyncEntries([
        { id: '=SUM(A1)', tradeDate: '2026-11-20', myProfit: 500, capitalUsed: null },
      ]),
    SheetSyncError
  );
  assert.throws(
    () =>
      validateSyncEntries([
        { id: 'TRD-ZERO', tradeDate: '2026-11-20', myProfit: 0, capitalUsed: null },
      ]),
    SheetSyncError
  );
  assert.throws(
    () =>
      validateSyncEntries([
        { id: 'TRD-BADDATE', tradeDate: '2026-02-31', myProfit: 500, capitalUsed: null },
      ]),
    SheetSyncError
  );
});

test('filterNewEntriesForSheet detects already-added entries and deduplicates new ones', () => {
  const sample: ValidatedSyncTrade[] = [
    {
      id: 'TRD-1',
      tradeDate: '2026-11-20',
      myProfit: 5000,
      capitalUsed: 50000,
      createdAt: '2026-11-20T09:00:00.000Z',
      updatedAt: '2026-11-20T09:00:00.000Z',
    },
    {
      id: 'TRD-2',
      tradeDate: '2026-11-21',
      myProfit: -1500,
      capitalUsed: null,
      createdAt: '2026-11-21T09:00:00.000Z',
      updatedAt: '2026-11-21T09:00:00.000Z',
    },
    {
      id: 'TRD-2',
      tradeDate: '2026-11-21',
      myProfit: -1500,
      capitalUsed: null,
      createdAt: '2026-11-21T09:00:00.000Z',
      updatedAt: '2026-11-21T09:00:00.000Z',
    },
  ];

  // Partial overlap: TRD-1 already in sheet, TRD-2 is new (duplicate in payload skipped)
  const partial = filterNewEntriesForSheet(sample, new Set(['TRD-1']));
  assert.equal(partial.newEntries.length, 1);
  assert.equal(partial.newEntries[0].id, 'TRD-2');
  assert.equal(partial.alreadyAddedCount, 2);

  // Full overlap: every entry already added
  const allAdded = filterNewEntriesForSheet(sample.slice(0, 2), new Set(['TRD-1', 'TRD-2']));
  assert.equal(allAdded.newEntries.length, 0);
  assert.equal(allAdded.alreadyAddedCount, 2);
});

test('parseServiceAccountFromEnv supports Base64 JSON and separate Vercel email/key env vars', () => {
  const b64 = Buffer.from(
    JSON.stringify({
      client_email: 'b64@example.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nB64KEY\n-----END PRIVATE KEY-----\n',
    }),
    'utf8'
  ).toString('base64');

  const fromB64 = parseServiceAccountFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: b64 });
  assert.ok(fromB64);
  assert.equal(fromB64.clientEmail, 'b64@example.iam.gserviceaccount.com');

  const fromSplit = parseServiceAccountFromEnv({
    GOOGLE_SERVICE_ACCOUNT_EMAIL: '"split@example.iam.gserviceaccount.com"',
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:
      '"-----BEGIN PRIVATE KEY-----\\nSPLITKEY\\n-----END PRIVATE KEY-----\\n"',
  });
  assert.ok(fromSplit);
  assert.equal(fromSplit.clientEmail, 'split@example.iam.gserviceaccount.com');
  assert.ok(fromSplit.privateKey.includes('\nSPLITKEY\n'));
});

test('Vercel serverless handlers enforce HTTP methods and authentication', async () => {
  const { default: statusHandler } = await import('../api/sheets/status.ts');
  const { default: syncHandler } = await import('../api/sheets/sync.ts');

  const makeMockRes = () => {
    const out: { statusCode: number; body: unknown; headers: Record<string, string> } = {
      statusCode: 200,
      body: null,
      headers: {},
    };
    const res = {
      setHeader(name: string, value: string) {
        out.headers[name.toLowerCase()] = value;
      },
      status(code: number) {
        out.statusCode = code;
        return res;
      },
      json(body: unknown) {
        out.body = body;
      },
    };
    return { res, out };
  };

  // GET /api/sheets/status -> 200 with public spreadsheet ID and GID
  const s1 = makeMockRes();
  statusHandler({ method: 'GET' }, s1.res);
  assert.equal(s1.out.statusCode, 200);
  assert.equal(
    (s1.out.body as { spreadsheetId: string }).spreadsheetId,
    DEFAULT_PERMANENT_SPREADSHEET_ID
  );
  assert.equal((s1.out.body as { sheetGid: number }).sheetGid, DEFAULT_PERMANENT_SHEET_GID);

  // POST /api/sheets/status -> 405
  const s2 = makeMockRes();
  statusHandler({ method: 'POST' }, s2.res);
  assert.equal(s2.out.statusCode, 405);

  // GET /api/sheets/sync -> 405
  const y1 = makeMockRes();
  await syncHandler({ method: 'GET' }, y1.res);
  assert.equal(y1.out.statusCode, 405);

  // POST /api/sheets/sync without auth -> 401
  const y2 = makeMockRes();
  await syncHandler({ method: 'POST', headers: {}, body: { entries: [] } }, y2.res);
  assert.equal(y2.out.statusCode, 401);

  // POST /api/sheets/sync with malformed X-Firebase-Auth header -> 401 (parsed properly)
  const y3 = makeMockRes();
  await syncHandler(
    { method: 'POST', headers: { 'x-firebase-auth': 'bad.token.value' }, body: { entries: [] } },
    y3.res
  );
  assert.equal(y3.out.statusCode, 401);
  assert.equal((y3.out.body as { error: string }).error, 'Malformed authentication token.');
});

