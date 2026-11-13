import cookieParser from 'cookie-parser';
import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getPaths, startAutomaticBackupScheduler } from './server/db.ts';
import { bootstrapLocalDatabase } from './server/scripts/setup-admin.ts';
import { initWebSocketServer } from './server/ws.ts';

import authRoutes from './server/routes/authRoutes.ts';
import dashboardRoutes from './server/routes/dashboardRoutes.ts';
import posRoutes from './server/routes/posRoutes.ts';
import menuRoutes from './server/routes/menuRoutes.ts';
import inventoryRoutes from './server/routes/inventoryRoutes.ts';
import tableRoutes from './server/routes/tableRoutes.ts';
import reportRoutes from './server/routes/reportRoutes.ts';
import userRoutes from './server/routes/userRoutes.ts';
import settingsRoutes from './server/routes/settingsRoutes.ts';

async function startServer() {
  // Ensure SQLite schema, roles, initial admin, and catalog exist
  bootstrapLocalDatabase({ logPrefix: '[Server Boot]' });
  startAutomaticBackupScheduler();

  const app = express();
  const server = http.createServer(app);
  initWebSocketServer(server);

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Local uploaded product images
  const { UPLOADS_DIR } = getPaths();
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Health check for offline/LAN connectivity probe
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'baslune-pos-local', timestamp: new Date().toISOString() });
  });

  // REST API modules
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/orders', posRoutes);
  app.use('/api/menu', menuRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/tables', tableRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/settings', settingsRoutes);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) return next();
        const patched = result.code
          .replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR WebSocket disabled */'
          )
          .replace(
            'else throw new SendBeforeConnectError("send was called before connect");',
            'else return;'
          )
          .replace('wsTransport.send(data);', '/* HMR disabled */');
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(patched);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        return next();
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[BASLUNE POS] Local server & WebSocket hub running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[BASLUNE POS] Failed to start server:', err);
  process.exit(1);
});
