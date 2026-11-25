import {
  AuthVerificationError,
  verifyFirebaseBearerToken,
} from '../../server/firebaseAuthVerify.ts';
import {
  SheetSyncError,
  syncEntriesToPermanentSheet,
} from '../../server/sheetsSync.ts';

const MAX_BODY_BYTES = 512 * 1024;

interface VercelReq {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelRes {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

function getAuthorizationHeader(headers: VercelReq['headers']): string | undefined {
  if (!headers) return undefined;
  const raw =
    headers['x-firebase-auth'] ??
    headers['X-Firebase-Auth'] ??
    headers.authorization ??
    headers.Authorization;
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

function parseRequestBody(rawBody: unknown): { entries?: unknown } {
  if (rawBody === undefined || rawBody === null) {
    return {};
  }
  if (typeof rawBody === 'string') {
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      throw new SheetSyncError('Sync payload is too large.', 413);
    }
    try {
      return JSON.parse(rawBody) as { entries?: unknown };
    } catch {
      throw new SheetSyncError('Invalid JSON request body.', 400);
    }
  }
  if (typeof rawBody === 'object') {
    const serializedBytes = Buffer.byteLength(JSON.stringify(rawBody), 'utf8');
    if (serializedBytes > MAX_BODY_BYTES) {
      throw new SheetSyncError('Sync payload is too large.', 413);
    }
    return rawBody as { entries?: unknown };
  }
  throw new SheetSyncError('Invalid request body.', 400);
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    await verifyFirebaseBearerToken(getAuthorizationHeader(req.headers));
    const parsedBody = parseRequestBody(req.body);
    const outcome = await syncEntriesToPermanentSheet(parsedBody.entries, process.env);
    res.status(200).json(outcome);
  } catch (err) {
    if (err instanceof AuthVerificationError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SheetSyncError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    res.status(500).json({
      error: 'Unexpected error while syncing entries to Google Sheets.',
    });
  }
}
