import { Hono } from 'hono';
import { Env } from '../types';
import { ApiResponse } from '@ledger/shared';

const healthRouter = new Hono<{ Bindings: Env }>();

healthRouter.get('/', async (c) => {
  let dbStatus = 'disconnected';
  let categoryCount = 0;

  try {
    if (c.env.DB) {
      const result = await c.env.DB.prepare('SELECT count(*) as count FROM categories').first<{ count: number }>();
      dbStatus = 'connected';
      categoryCount = result?.count ?? 0;
    }
  } catch (err: any) {
    dbStatus = `error: ${err?.message || 'unknown error'}`;
  }

  const response: ApiResponse<{
    status: string;
    version: string;
    runtime: string;
    timestamp: string;
    database: {
      status: string;
      categoryCount: number;
    };
  }> = {
    success: true,
    data: {
      status: 'healthy',
      version: '1.0.0',
      runtime: 'Cloudflare Workers (Hono)',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        categoryCount,
      },
    },
    message: 'Serverless Ledger API is running smoothly.',
  };

  return c.json(response);
});

export default healthRouter;
