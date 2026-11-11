import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import * as dotenv from 'dotenv';
import {
  requireAuth,
  optionalAuth,
  AuthRequest,
} from './src/middleware/auth.ts';
import { getOrCreateUser } from './src/db/users.ts';
import {
  listAllHazardsWithWard,
  submitOrMergeHazardReport,
  confirmExistingHazardById,
  updateHazardStatusById,
  generateAndStoreEvidencePacket,
  getRealWardDashboardAnalytics,
} from './src/db/repository.ts';
import {
  handleIntakePreviewRequest,
  handleTriageAdvisoryRequest,
  handleOrchestrateSpecRequest,
  filterAndPaginateHazards,
} from './src/lib/api-handlers.ts';
import { BBMP_WARDS } from './src/lib/data/bbmp-wards.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  // 1. Authenticated user synchronization endpoint (Firebase Auth + Cloud SQL users table)
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || 'citizen@sakshi.bengaluru.in';
      if (!uid) {
        return res.status(401).json({ error: 'Unauthorized: Missing user UID' });
      }
      const userRecord = await getOrCreateUser(uid, email);
      res.json({ user: userRecord });
    } catch (error: any) {
      console.error('Failed to sync authenticated user:', error);
      res.status(500).json({ error: error.message || 'Failed to sync user' });
    }
  });

  // 2. BBMP Ward GeoJSON boundaries & officer directory
  app.get('/api/wards', optionalAuth, async (_req: AuthRequest, res) => {
    try {
      res.json({ wards: BBMP_WARDS });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load wards' });
    }
  });

  // 3. List all hazards with ward officer metadata, confirmation records, filtering & pagination
  app.get('/api/hazards', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const records = await listAllHazardsWithWard();
      const filtered = filterAndPaginateHazards(records, {
        wardId: req.query.wardId as string | undefined,
        status: req.query.status as string | undefined,
        category: req.query.category as string | undefined,
        limit: req.query.limit as string | undefined,
        offset: req.query.offset as string | undefined,
      });
      res.json(filtered);
    } catch (error: any) {
      console.error('GET /api/hazards error:', error);
      res.status(500).json({ error: error.message || 'Failed to load hazards' });
    }
  });

  // 4. Agent 1 Preview: Intake validation, SHA-256 hash, & Point-in-Polygon BBMP ward resolution
  app.post('/api/agents/intake-preview', optionalAuth, (req: AuthRequest, res) => {
    try {
      const result = handleIntakePreviewRequest(req.body);
      res.status(result.status).json(result.body);
    } catch (error: any) {
      res.status(400).json({ valid: false, error: error.message || 'Intake error' });
    }
  });

  // 5. Agent 2 Advisory Triage & 50m Duplicate Radar check
  app.post('/api/agents/triage', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const existing = await listAllHazardsWithWard();
      const result = await handleTriageAdvisoryRequest(req.body, existing);
      res.status(result.status).json(result.body);
    } catch (error: any) {
      console.error('POST /api/agents/triage error:', error);
      res.status(500).json({ error: error.message || 'Vision triage failed' });
    }
  });

  // 6. Submit new hazard (runs Agent 1 + Agent 2 50m deduplication)
  app.post('/api/hazards', optionalAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user?.uid && req.user?.email) {
        await getOrCreateUser(req.user.uid, req.user.email);
      }
      const deviceId =
        req.user?.uid || req.body.deviceId || 'anon-citizen-session';

      const result = await submitOrMergeHazardReport({
        photoDataUrl: req.body.photoDataUrl,
        lat: Number(req.body.lat),
        lng: Number(req.body.lng),
        category: req.body.category,
        severity: req.body.severity,
        aiSuggestedCategory: req.body.aiSuggestedCategory,
        aiSuggestedSeverity: req.body.aiSuggestedSeverity,
        description: req.body.description || '',
        deviceId,
        dedupRadiusMeters: req.body.dedupRadiusMeters
          ? Number(req.body.dedupRadiusMeters)
          : 50,
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error('POST /api/hazards error:', error);
      res.status(400).json({ error: error.message || 'Submission failed' });
    }
  });

  // 7. Flow 3: Confirm an existing hazard (corroborating tap/photo)
  app.post('/api/hazards/:id/confirm', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const hazardId = Number(req.params.id);
      const deviceId =
        req.user?.uid || req.body.deviceId || 'anon-citizen-session';
      const updated = await confirmExistingHazardById({
        hazardId,
        deviceId,
        note: req.body.note,
        photoDataUrl: req.body.photoDataUrl,
      });
      res.json({ hazard: updated });
    } catch (error: any) {
      console.error('POST /api/hazards/:id/confirm error:', error);
      const status = error.statusCode || 400;
      res.status(status).json({ error: error.message || 'Confirmation failed' });
    }
  });

  // 8. Update hazard status (open / resolved / disputed)
  app.patch('/api/hazards/:id/status', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const hazardId = Number(req.params.id);
      const status = req.body.status;
      if (!['open', 'resolved', 'disputed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status value.' });
      }
      const updated = await updateHazardStatusById({ hazardId, status });
      res.json({ hazard: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Status update failed' });
    }
  });

  // 9. Flow 4 / Agent 3: Generate & retrieve cryptographic Evidence Packet
  app.post('/api/hazards/:id/evidence-packet', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const hazardId = Number(req.params.id);
      const packet = await generateAndStoreEvidencePacket(hazardId);
      res.json({ packet });
    } catch (error: any) {
      console.error('POST /api/hazards/:id/evidence-packet error:', error);
      res.status(400).json({ error: error.message || 'Failed to generate packet' });
    }
  });

  app.get('/api/hazards/:id/evidence-packet', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const hazardId = Number(req.params.id);
      const packet = await generateAndStoreEvidencePacket(hazardId);
      res.json(packet);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to retrieve packet' });
    }
  });

  // 10. Flow 5: Public Ward Accountability Dashboard (real PostgreSQL aggregation)
  app.get('/api/dashboard/wards', optionalAuth, async (_req: AuthRequest, res) => {
    try {
      const analytics = await getRealWardDashboardAnalytics();
      res.json(analytics);
    } catch (error: any) {
      console.error('GET /api/dashboard/wards error:', error);
      res.status(500).json({ error: error.message || 'Failed to load dashboard' });
    }
  });

  // 11. IBM watsonx Orchestrate ADK Agent Specification endpoint
  app.get('/api/agents/orchestrate-spec', (_req, res) => {
    const result = handleOrchestrateSpecRequest();
    res.status(result.status).json(result.body);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sakshi server running on http://localhost:${PORT}`);
  });
}

startServer();
