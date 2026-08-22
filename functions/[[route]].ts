import { handle } from 'hono/cloudflare-pages';
import app from '../packages/server/src/index';

// 将已有的 Hono 后端直接挂载为 Cloudflare Pages Functions
export const onRequest = handle(app);