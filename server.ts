import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AuthVerificationError,
  verifyFirebaseBearerToken,
} from './server/firebaseAuthVerify.ts';
import {
  getPermanentSheetConfig,
  SheetSyncError,
  syncEntriesToPermanentSheet,
} from './server/sheetsSync.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/sheets/status', (_req, res) => {
    const config = getPermanentSheetConfig(process.env);
    res.json({
      configured: Boolean(config.credentials),
      spreadsheetId: config.spreadsheetId,
      sheetGid: config.sheetGid,
      spreadsheetUrl: config.spreadsheetUrl,
      serviceAccountEmail: config.credentials?.clientEmail ?? null,
    });
  });

  app.post('/api/sheets/sync', async (req, res) => {
    try {
      const firebaseAuthHeader = req.headers['x-firebase-auth'];
      const tokenHeader =
        typeof firebaseAuthHeader === 'string'
          ? firebaseAuthHeader
          : Array.isArray(firebaseAuthHeader)
            ? firebaseAuthHeader[0]
            : req.headers.authorization;
      await verifyFirebaseBearerToken(tokenHeader);
      const body = req.body as { entries?: unknown } | undefined;
      const outcome = await syncEntriesToPermanentSheet(body?.entries, process.env);
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
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
