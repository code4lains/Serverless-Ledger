import { handle } from 'hono/cloudflare-pages';
import app from '../../packages/server/src/index';

export const onRequest = handle(app);