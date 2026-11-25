import { getPermanentSheetConfig } from '../../server/sheetsSync.ts';

interface VercelReq {
  method?: string;
}

interface VercelRes {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
}

export default function handler(req: VercelReq, res: VercelRes): void {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const config = getPermanentSheetConfig(process.env);
  res.status(200).json({
    configured: Boolean(config.credentials),
    spreadsheetId: config.spreadsheetId,
    sheetGid: config.sheetGid,
    spreadsheetUrl: config.spreadsheetUrl,
    serviceAccountEmail: config.credentials?.clientEmail ?? null,
  });
}
