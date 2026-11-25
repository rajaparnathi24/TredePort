import crypto from 'node:crypto';
import fs from 'node:fs';

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export class AuthVerificationError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthVerificationError';
    this.status = status;
  }
}

interface CertCache {
  certs: Record<string, string>;
  expiresAtMs: number;
}

let certCache: CertCache | null = null;
let cachedProjectId: string | null = null;

const DEFAULT_FIREBASE_PROJECT_ID = 'gen-lang-client-0786763932';

function loadFirebaseProjectId(): string {
  if (cachedProjectId) return cachedProjectId;

  const envProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (envProjectId) {
    cachedProjectId = envProjectId;
    return envProjectId;
  }

  try {
    const configUrl = new URL('../firebase-applet-config.json', import.meta.url);
    const raw = fs.readFileSync(configUrl, 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: unknown };
    if (typeof parsed.projectId === 'string' && parsed.projectId.trim().length > 0) {
      cachedProjectId = parsed.projectId.trim();
      return cachedProjectId;
    }
  } catch {
    // Fall back to default public projectId in bundled serverless runtimes
  }

  cachedProjectId = DEFAULT_FIREBASE_PROJECT_ID;
  return cachedProjectId;
}

function parseMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) return 300;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match) return 300;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 30 ? seconds : 300;
}

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAtMs > now) {
    return certCache.certs;
  }

  const response = await fetch(GOOGLE_CERTS_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new AuthVerificationError('Unable to verify sign-in token right now.', 503);
  }

  const certs = (await response.json()) as Record<string, string>;
  const maxAge = parseMaxAgeSeconds(response.headers.get('cache-control'));
  certCache = {
    certs,
    expiresAtMs: now + maxAge * 1000,
  };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const raw = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(raw) as T;
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}

interface FirebaseJwtPayload {
  aud?: unknown;
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  email?: unknown;
  email_verified?: unknown;
}

export async function verifyFirebaseBearerToken(
  tokenOrHeader: string | undefined
): Promise<VerifiedFirebaseUser> {
  const trimmed = typeof tokenOrHeader === 'string' ? tokenOrHeader.trim() : '';
  if (!trimmed) {
    throw new AuthVerificationError('Please sign in with Google before syncing.', 401);
  }

  const token = trimmed.startsWith('Bearer ') ? trimmed.slice('Bearer '.length).trim() : trimmed;
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthVerificationError('Invalid authentication token.', 401);
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  let header: JwtHeader;
  let payload: FirebaseJwtPayload;
  try {
    header = decodeBase64UrlJson<JwtHeader>(headerB64);
    payload = decodeBase64UrlJson<FirebaseJwtPayload>(payloadB64);
  } catch {
    throw new AuthVerificationError('Malformed authentication token.', 401);
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new AuthVerificationError('Unsupported authentication token algorithm.', 401);
  }

  const certs = await getGooglePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new AuthVerificationError('Authentication signing key not recognized.', 401);
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signature = Buffer.from(signatureB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const isValidSignature = verifier.verify(certPem, signature);
  if (!isValidSignature) {
    throw new AuthVerificationError('Authentication signature verification failed.', 401);
  }

  const projectId = loadFirebaseProjectId();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;

  if (payload.aud !== projectId || payload.iss !== expectedIssuer) {
    throw new AuthVerificationError('Authentication token audience mismatch.', 401);
  }

  if (
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSeconds ||
    typeof payload.iat !== 'number' ||
    payload.iat > nowSeconds + 60
  ) {
    throw new AuthVerificationError('Your sign-in session expired. Please refresh and try again.', 401);
  }

  if (typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    throw new AuthVerificationError('Invalid user identity in token.', 401);
  }

  return {
    uid: payload.sub.trim(),
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
  };
}
