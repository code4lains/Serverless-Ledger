import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { Env, AppVariables } from './types';
import { optionalAuth } from './middleware/auth';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import categoriesRouter from './routes/categories';
import ledgersRouter from './routes/ledgers';
import transactionsRouter from './routes/transactions';
import { ApiResponse } from '@ledger/shared';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 中间件
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use('/api/*', optionalAuth);

// 路由挂载
app.route('/api/health', healthRouter);
app.route('/api/auth', authRouter);
app.route('/api/categories', categoriesRouter);
app.route('/api/ledgers', ledgersRouter);
app.route('/api/transactions', transactionsRouter);


// 根路由
app.get('/', (c) => {
  return c.json({
    name: 'Serverless Ledger API',
    status: 'online',
    documentation: '/api/health',
  });
});

// 全局 404
app.notFound((c) => {
  const res: ApiResponse = {
    success: false,
    error: `Endpoint not found: ${c.req.url}`,
  };
  return c.json(res, 404);
});

// 全局错误处理
app.onError((err, c) => {
  console.error('Unhandled Server Error:', err);
  const res: ApiResponse = {
    success: false,
    error: err.message || 'Internal Server Error',
  };
  return c.json(res, 500);
});

export default app;
