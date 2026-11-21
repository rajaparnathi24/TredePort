import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { TradeRecord } from '../types/trade';
import { getFirebaseAuth, getFirebaseDb } from './firebaseClient';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const auth = getFirebaseAuth();
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface CloudSpreadsheetMeta {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
}

function timestampToISO(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return new Date().toISOString();
}

export function sanitizeTradeDocId(rawId: string): string {
  const cleaned = rawId.trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
  return cleaned.length > 0 ? cleaned : `TRD-${Date.now().toString(36).toUpperCase()}`;
}

function sanitizeSpreadsheetUrl(url: string): string {
  const trimmed = url.trim().slice(0, 500);
  if (trimmed === '' || trimmed.startsWith('https://docs.google.com/spreadsheets/')) {
    return trimmed;
  }
  return '';
}

/**
 * Ensures the parent /users/{uid} document exists so subcollection Master Gate rules pass.
 */
export async function ensureUserProfile(uid: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  let exists = false;
  try {
    const snap = await getDoc(ref);
    exists = snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!exists) {
    try {
      await setDoc(ref, {
        ownerId: uid,
        spreadsheetId: '',
        spreadsheetTitle: '',
        spreadsheetUrl: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

/**
 * Subscribes in real time to /users/{uid} for cross-device linked Google Spreadsheet metadata.
 */
export function subscribeUserProfile(
  uid: string,
  onProfile: (meta: CloudSpreadsheetMeta | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => {};

  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onProfile(null);
        return;
      }
      const data = snap.data();
      const spreadsheetId = typeof data.spreadsheetId === 'string' ? data.spreadsheetId : '';
      const spreadsheetTitle =
        typeof data.spreadsheetTitle === 'string' ? data.spreadsheetTitle : '';
      const spreadsheetUrl = typeof data.spreadsheetUrl === 'string' ? data.spreadsheetUrl : '';
      if (spreadsheetId) {
        onProfile({ spreadsheetId, spreadsheetTitle, spreadsheetUrl });
      } else {
        onProfile(null);
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Saves linked Google Spreadsheet metadata to /users/{uid} so mobile & desktop share the same link.
 */
export async function saveUserSpreadsheetMeta(
  uid: string,
  meta: CloudSpreadsheetMeta
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  await ensureUserProfile(uid);

  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  const safeId = meta.spreadsheetId.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const safeTitle = meta.spreadsheetTitle.trim().slice(0, 200);
  const safeUrl = sanitizeSpreadsheetUrl(meta.spreadsheetUrl);

  try {
    await updateDoc(ref, {
      spreadsheetId: safeId,
      spreadsheetTitle: safeTitle,
      spreadsheetUrl: safeUrl,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Subscribes in real time to /users/{uid}/trades filtered by ownerId == uid.
 * Any add, edit, or delete on mobile or desktop immediately updates all signed-in sessions.
 */
export function subscribeUserTrades(
  uid: string,
  onTrades: (trades: TradeRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const db = getFirebaseDb();
  if (!db) return () => {};

  const path = `users/${uid}/trades`;
  const tradesQuery = query(collection(db, 'users', uid, 'trades'), where('ownerId', '==', uid));

  return onSnapshot(
    tradesQuery,
    (snapshot) => {
      const records: TradeRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const tradeDate = typeof data.tradeDate === 'string' ? data.tradeDate : '';
        const myProfit = typeof data.myProfit === 'number' ? data.myProfit : Number(data.myProfit);
        const capitalRaw = data.capitalUsed;
        const capitalUsed =
          capitalRaw === null || capitalRaw === undefined
            ? null
            : typeof capitalRaw === 'number' && Number.isFinite(capitalRaw)
              ? capitalRaw
              : null;

        if (!tradeDate || !Number.isFinite(myProfit)) return;

        records.push({
          id: typeof data.id === 'string' ? data.id : docSnap.id,
          tradeDate,
          myProfit,
          capitalUsed,
          createdAt: timestampToISO(data.createdAt),
          updatedAt: timestampToISO(data.updatedAt),
        });
      });

      // Keep newest-first deterministic order
      records.sort((a, b) => {
        if (a.tradeDate !== b.tradeDate) return b.tradeDate.localeCompare(a.tradeDate);
        if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
        return b.id.localeCompare(a.id);
      });

      onTrades(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Creates a new trade record in /users/{uid}/trades/{tradeId}.
 */
export async function createCloudTrade(uid: string, record: TradeRecord): Promise<void> {
  const db = getFirebaseDb();
  if (!db) {
    throw new Error('Cloud database is not available.');
  }

  await ensureUserProfile(uid);

  const safeId = sanitizeTradeDocId(record.id);
  const path = `users/${uid}/trades/${safeId}`;
  const ref = doc(db, 'users', uid, 'trades', safeId);

  try {
    await setDoc(ref, {
      id: safeId,
      ownerId: uid,
      tradeDate: record.tradeDate,
      myProfit: record.myProfit,
      capitalUsed: record.capitalUsed,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Updates an existing trade record in /users/{uid}/trades/{tradeId}.
 */
export async function updateCloudTrade(uid: string, record: TradeRecord): Promise<void> {
  const db = getFirebaseDb();
  if (!db) {
    throw new Error('Cloud database is not available.');
  }

  const safeId = sanitizeTradeDocId(record.id);
  const path = `users/${uid}/trades/${safeId}`;
  const ref = doc(db, 'users', uid, 'trades', safeId);

  try {
    await updateDoc(ref, {
      tradeDate: record.tradeDate,
      myProfit: record.myProfit,
      capitalUsed: record.capitalUsed,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Deletes a trade record from /users/{uid}/trades/{tradeId}.
 */
export async function deleteCloudTrade(uid: string, tradeId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) {
    throw new Error('Cloud database is not available.');
  }

  const safeId = sanitizeTradeDocId(tradeId);
  const path = `users/${uid}/trades/${safeId}`;
  const ref = doc(db, 'users', uid, 'trades', safeId);

  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Merges trades fetched from a connected Google Sheet into Cloud Firestore
 * so mobile and desktop devices logged into the same account immediately see them.
 */
export async function syncRecordsToCloud(
  uid: string,
  incomingRecords: TradeRecord[],
  existingCloudIds: Set<string>
): Promise<number> {
  const db = getFirebaseDb();
  if (!db || incomingRecords.length === 0) return 0;

  await ensureUserProfile(uid);

  let syncedCount = 0;
  for (const rec of incomingRecords) {
    const safeId = sanitizeTradeDocId(rec.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.tradeDate) || !Number.isFinite(rec.myProfit)) {
      continue;
    }
    const safeCapital =
      rec.capitalUsed !== null && Number.isFinite(rec.capitalUsed) && rec.capitalUsed >= 0
        ? rec.capitalUsed
        : null;

    if (existingCloudIds.has(safeId)) {
      await updateCloudTrade(uid, {
        ...rec,
        id: safeId,
        capitalUsed: safeCapital,
      });
    } else {
      await createCloudTrade(uid, {
        ...rec,
        id: safeId,
        capitalUsed: safeCapital,
      });
      existingCloudIds.add(safeId);
    }
    syncedCount += 1;
  }

  return syncedCount;
}
