import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export interface GoogleAuthUser {
  email: string | null;
  displayName: string | null;
}

export interface GoogleSignInResult {
  user: GoogleAuthUser;
  accessToken: string;
}

function hasValidFirebaseConfig(): boolean {
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
let isSigningIn = false;
let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

function ensureFirebaseAuth(): Auth | null {
  if (firebaseAuth) return firebaseAuth;
  if (!hasValidFirebaseConfig()) return null;
  const existing = getApps();
  firebaseApp = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
  return firebaseAuth;
}

/**
 * Initializes authentication state listener on app mount.
 * Clears in-memory token automatically on sign-out.
 */
export function initGoogleAuth(
  onAuthSuccess: (user: GoogleAuthUser, token: string) => void,
  onAuthCleared: () => void
): () => void {
  const auth = ensureFirebaseAuth();
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
      if (cachedAccessToken) {
        cachedUser = { email: user.email, displayName: user.displayName };
        onAuthSuccess(cachedUser, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        cachedUser = null;
        onAuthCleared();
      }
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
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')), {
        once: true,
      });
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
        cachedUser = { email: null, displayName: 'Google Account' };
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
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const auth = ensureFirebaseAuth();
  if (auth) {
    const provider = new GoogleAuthProvider();
    for (const scope of SCOPES) {
      provider.addScope(scope);
    }

    try {
      isSigningIn = true;
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Google sign-in succeeded, but no Sheets access token was returned.');
      }
      cachedAccessToken = credential.accessToken;
      cachedUser = {
        email: result.user.email,
        displayName: result.user.displayName,
      };
      return {
        user: cachedUser,
        accessToken: cachedAccessToken,
      };
    } catch (err) {
      throw formatGoogleAuthError(err);
    } finally {
      isSigningIn = false;
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

  const auth = ensureFirebaseAuth();
  if (auth) {
    await auth.signOut();
    return;
  }

  const win = window as GisWindow;
  if (tokenToRevoke && win.google?.accounts?.oauth2?.revoke) {
    win.google.accounts.oauth2.revoke(tokenToRevoke);
  }
}
