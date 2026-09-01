import { Hono } from 'hono';
import { Env } from '../types';
import { ApiResponse } from '@ledger/shared';
import { getRepositories } from '../repositories';

const healthRouter = new Hono<{ Bindings: Env }>();

healthRouter.get('/', async (c) => {
  let dbStatus = 'disconnected';
  let categoryCount = 0;

  try {
    if (c.env.DB) {
      const repos = getRepositories(c.env.DB);
      const categories = await repos.categories.findByUserId();
      dbStatus = 'connected';
      categoryCount = categories.length;
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
