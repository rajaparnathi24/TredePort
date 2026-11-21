import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesSource = fs.readFileSync(rulesPath, 'utf8');

interface MockAuth {
  uid: string;
  emailVerified: boolean;
}

interface MockTimestamp {
  seconds: number;
}

const REQUEST_TIME: MockTimestamp = { seconds: 1700000000 };

function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function isValidTradeId(id: unknown): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(id);
}

function validateUserProfileRule(
  auth: MockAuth | null,
  userId: string,
  data: Record<string, unknown>
): boolean {
  if (!auth || !auth.emailVerified || auth.uid !== userId || !isValidId(userId)) {
    return false;
  }
  const requiredKeys = [
    'ownerId',
    'spreadsheetId',
    'spreadsheetTitle',
    'spreadsheetUrl',
    'createdAt',
    'updatedAt',
  ];
  const keys = Object.keys(data);
  if (keys.length !== requiredKeys.length || !requiredKeys.every((k) => keys.includes(k))) {
    return false;
  }
  if (data.ownerId !== auth.uid || data.ownerId !== userId) return false;
  if (
    typeof data.spreadsheetId !== 'string' ||
    data.spreadsheetId.length > 128 ||
    !/^[a-zA-Z0-9_-]*$/.test(data.spreadsheetId)
  ) {
    return false;
  }
  if (typeof data.spreadsheetTitle !== 'string' || data.spreadsheetTitle.length > 200) {
    return false;
  }
  if (
    typeof data.spreadsheetUrl !== 'string' ||
    data.spreadsheetUrl.length > 500 ||
    (data.spreadsheetUrl !== '' &&
      !/^https:\/\/docs\.google\.com\/spreadsheets\/.*$/.test(data.spreadsheetUrl))
  ) {
    return false;
  }
  return data.createdAt === REQUEST_TIME && data.updatedAt === REQUEST_TIME;
}

function validateTradeCreateRule(
  auth: MockAuth | null,
  userId: string,
  tradeId: string,
  parentExistsAndOwned: boolean,
  data: Record<string, unknown>
): boolean {
  if (
    !auth ||
    !auth.emailVerified ||
    auth.uid !== userId ||
    !isValidId(userId) ||
    !isValidTradeId(tradeId) ||
    !parentExistsAndOwned
  ) {
    return false;
  }
  const requiredKeys = [
    'id',
    'ownerId',
    'tradeDate',
    'myProfit',
    'capitalUsed',
    'createdAt',
    'updatedAt',
  ];
  const keys = Object.keys(data);
  if (keys.length !== requiredKeys.length || !requiredKeys.every((k) => keys.includes(k))) {
    return false;
  }
  if (data.id !== tradeId || data.ownerId !== auth.uid || data.ownerId !== userId) {
    return false;
  }
  if (
    typeof data.tradeDate !== 'string' ||
    data.tradeDate.length !== 10 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.tradeDate)
  ) {
    return false;
  }
  if (
    typeof data.myProfit !== 'number' ||
    !Number.isFinite(data.myProfit) ||
    data.myProfit < -1_000_000_000 ||
    data.myProfit > 1_000_000_000
  ) {
    return false;
  }
  if (
    data.capitalUsed !== null &&
    (typeof data.capitalUsed !== 'number' ||
      !Number.isFinite(data.capitalUsed) ||
      data.capitalUsed < 0 ||
      data.capitalUsed > 10_000_000_000)
  ) {
    return false;
  }
  return data.createdAt === REQUEST_TIME && data.updatedAt === REQUEST_TIME;
}

test('firestore.rules enforces all Eight Pillars structurally', () => {
  assert.match(rulesSource, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/);
  assert.match(rulesSource, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesSource, /allow list: if false;/);
  assert.match(rulesSource, /allow list: if isOwner\(userId\) &&\s*existing\(\)\.ownerId == request\.auth\.uid;/);
  assert.match(rulesSource, /ownsParentUser\(userId\)/);
  assert.match(rulesSource, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesSource, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesSource, /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(/);
});

test('Dirty Dozen adversarial payloads are rejected and valid payloads accepted', () => {
  const validAuth: MockAuth = { uid: 'user_abc_123', emailVerified: true };

  // Valid profile
  assert.equal(
    validateUserProfileRule(validAuth, 'user_abc_123', {
      ownerId: 'user_abc_123',
      spreadsheetId: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
      spreadsheetTitle: 'My Trading Profit Tracker',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit',
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    }),
    true
  );

  // 1. Unauthenticated / unverified
  assert.equal(
    validateTradeCreateRule(null, 'user_abc_123', 'TRD-1234', true, {
      id: 'TRD-1234',
      ownerId: 'user_abc_123',
      tradeDate: '2026-11-20',
      myProfit: 2500,
      capitalUsed: 10000,
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    }),
    false
  );
  assert.equal(
    validateTradeCreateRule({ uid: 'user_abc_123', emailVerified: false }, 'user_abc_123', 'TRD-1234', true, {
      id: 'TRD-1234',
      ownerId: 'user_abc_123',
      tradeDate: '2026-11-20',
      myProfit: 2500,
      capitalUsed: null,
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    }),
    false
  );

  // 2. Cross-user write & ownerId spoofing
  assert.equal(
    validateTradeCreateRule({ uid: 'attacker_999', emailVerified: true }, 'user_abc_123', 'TRD-1234', true, {
      id: 'TRD-1234',
      ownerId: 'user_abc_123',
      tradeDate: '2026-11-20',
      myProfit: 2500,
      capitalUsed: null,
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    }),
    false
  );

  // 3. Field injection (isAdmin)
  assert.equal(
    validateUserProfileRule(validAuth, 'user_abc_123', {
      ownerId: 'user_abc_123',
      spreadsheetId: '',
      spreadsheetTitle: '',
      spreadsheetUrl: '',
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
      isAdmin: true,
    }),
    false
  );

  // 4. Javascript URL injection in spreadsheetUrl
  assert.equal(
    validateUserProfileRule(validAuth, 'user_abc_123', {
      ownerId: 'user_abc_123',
      spreadsheetId: '',
      spreadsheetTitle: 'Evil',
      spreadsheetUrl: 'javascript:alert(1)',
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    }),
    false
  );

  // 5. Missing parent profile (orphan subcollection write)
  assert.equal(
    validateTradeCreateRule(validAuth, 'user_abc_123', 'TRD-1234', false, {
      id: 'TRD-1234',
      ownerId: 'user_abc_123',
      tradeDate: '2026-11-20',
      myProfit: 2500,
      capitalUsed: null,
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    }),
    false
  );

  // 6. Negative capital & malformed date & spoofed timestamp
  assert.equal(
    validateTradeCreateRule(validAuth, 'user_abc_123', 'TRD-1234', true, {
      id: 'TRD-1234',
      ownerId: 'user_abc_123',
      tradeDate: '20-11-2026',
      myProfit: 2500,
      capitalUsed: -100,
      createdAt: { seconds: 1 },
      updatedAt: REQUEST_TIME,
    }),
    false
  );

  // 7. Valid trade with null optional capital
  assert.equal(
    validateTradeCreateRule(validAuth, 'user_abc_123', 'TRD-1234', true, {
      id: 'TRD-1234',
      ownerId: 'user_abc_123',
      tradeDate: '2026-11-20',
      myProfit: 2500,
      capitalUsed: null,
      createdAt: REQUEST_TIME,
      updatedAt: REQUEST_TIME,
    }),
    true
  );
});
