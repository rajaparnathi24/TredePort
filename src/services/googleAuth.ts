import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import { firebaseConfig, getFirebaseAuth, hasValidFirebaseConfig } from './firebaseClient';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export interface GoogleAuthUser {
  uid: string | null;
  email: string | null;
  displayName: string | null;
}

export interface GoogleSignInResult {
  user: GoogleAuthUser;
  accessToken: string | null;
}

function getGisClientId(): string | null {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (typeof raw === 'string' && raw.trim().length > 10) {
    return raw.trim();
  }
  return null;
}

export function getAuthProviderType(): 'firebase' | 'gis' | 'none' {
  if (hasValidFirebaseConfig()) return 'firebase';
  if (getGisClientId()) return 'gis';
  return 'none';
}

// Strict in-memory token cache — NEVER persisted to localStorage or sessionStorage.
let cachedAccessToken: string | null = null;
let cachedUser: GoogleAuthUser | null = null;

/**
 * Initializes authentication state listener on app mount.
 * Preserves Firebase Auth session across reloads and devices for real-time Cloud Firestore sync,
 * while keeping the Google Sheets OAuth access token strictly in memory.
 */
export function initGoogleAuth(
  onAuthSuccess: (user: GoogleAuthUser, token: string | null) => void,
  onAuthCleared: () => void
): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    if (cachedAccessToken && cachedUser) {
      onAuthSuccess(cachedUser, cachedAccessToken);
    } else {
      onAuthCleared();
    }
    return () => {};
  }

  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      cachedUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      };
      onAuthSuccess(cachedUser, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      cachedUser = null;
      onAuthCleared();
    }
  });
}

// Minimal type for Google Identity Services token client (standalone deployment fallback)
interface GisTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GisWindow extends Window {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (resp: GisTokenResponse) => void;
          error_callback?: (err: { message?: string; type?: string }) => void;
        }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        revoke?: (token: string, done?: () => void) => void;
      };
    };
  };
}

function loadGisScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const win = window as GisWindow;
    if (win.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Google Identity Services.')),
        { once: true }
      );
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Google Identity Services script.'));
    document.head.appendChild(script);
  });
}

async function signInWithGis(clientId: string): Promise<GoogleSignInResult> {
  await loadGisScript();
  const win = window as GisWindow;
  const oauth2 = win.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google OAuth client is unavailable in this browser.');
  }

  return new Promise((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(' '),
      callback: (response: GisTokenResponse) => {
        if (response.error || !response.access_token) {
          reject(
            new Error(
              response.error_description || response.error || 'Google sign-in was cancelled or denied.'
            )
          );
          return;
        }
        cachedAccessToken = response.access_token;
        cachedUser = { uid: null, email: null, displayName: 'Google Account' };
        resolve({ user: cachedUser, accessToken: response.access_token });
      },
      error_callback: (err) => {
        reject(new Error(err.message || 'Google sign-in popup was closed or blocked.'));
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

function formatGoogleAuthError(err: unknown): Error {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
  const projectId = firebaseConfig?.projectId || 'your Firebase project';

  if (code === 'auth/unauthorized-domain') {
    return new Error(
      `Domain "${host}" is not authorized for Google Sign-In yet. Open Firebase Console (${projectId}) → Authentication → Settings → Authorized domains, click "Add domain", and add "${host}".`
    );
  }
  if (code === 'auth/popup-blocked') {
    return new Error(
      'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.'
    );
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new Error('Google sign-in was cancelled before completing.');
  }
  if (err instanceof Error) {
    return err;
  }
  return new Error('Google sign-in failed. Please try again.');
}

/**
 * Initiates interactive Google OAuth 2.0 sign-in (must be triggered from a user button click).
 * Signs the user into Firebase Auth (persistent cross-device Cloud Firestore sync) and
 * requests the Google Sheets scope for live spreadsheet syncing (kept in memory only).
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const auth = getFirebaseAuth();
  if (auth) {
    const provider = new GoogleAuthProvider();
    for (const scope of SCOPES) {
      provider.addScope(scope);
    }

    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      cachedAccessToken = credential?.accessToken ?? null;
      cachedUser = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
      };
      return {
        user: cachedUser,
        accessToken: cachedAccessToken,
      };
    } catch (err) {
      throw formatGoogleAuthError(err);
    }
  }

  const clientId = getGisClientId();
  if (clientId) {
    return signInWithGis(clientId);
  }

  throw new Error(
    'Google OAuth is not configured yet. Follow the setup guide in Settings to enable Google Sheets OAuth 2.0.'
  );
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export function clearCachedAccessToken(): void {
  cachedAccessToken = null;
}

export async function signOutGoogle(): Promise<void> {
  const tokenToRevoke = cachedAccessToken;
  cachedAccessToken = null;
  cachedUser = null;

  const auth = getFirebaseAuth();
  if (auth) {
    await auth.signOut();
    return;
  }

  const win = window as GisWindow;
  if (tokenToRevoke && win.google?.accounts?.oauth2?.revoke) {
    win.google.accounts.oauth2.revoke(tokenToRevoke);
  }
}
