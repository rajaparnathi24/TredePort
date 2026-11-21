import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export function hasValidFirebaseConfig(): boolean {
  return Boolean(
    firebaseConfig &&
      typeof firebaseConfig.apiKey === 'string' &&
      firebaseConfig.apiKey.length > 0 &&
      typeof firebaseConfig.authDomain === 'string' &&
      firebaseConfig.authDomain.length > 0 &&
      typeof firebaseConfig.projectId === 'string' &&
      firebaseConfig.projectId.length > 0
  );
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let connectionChecked = false;

export function getFirebaseApp(): FirebaseApp | null {
  if (cachedApp) return cachedApp;
  if (!hasValidFirebaseConfig()) return null;
  const existing = getApps();
  cachedApp = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  return cachedApp;
}

export function getFirebaseAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getFirebaseApp();
  if (!app) return null;
  cachedAuth = getAuth(app);
  return cachedAuth;
}

export function getFirebaseDb(): Firestore | null {
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  if (!app) return null;
  const databaseId =
    typeof firebaseConfig.firestoreDatabaseId === 'string' &&
    firebaseConfig.firestoreDatabaseId.trim().length > 0
      ? firebaseConfig.firestoreDatabaseId.trim()
      : undefined;
  cachedDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  if (!connectionChecked) {
    connectionChecked = true;
    void testFirestoreConnection(cachedDb);
  }
  return cachedDb;
}

async function testFirestoreConnection(db: Firestore): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    // Skip logging for other errors (e.g., expected permission-denied on test doc)
  }
}

export { firebaseConfig };
