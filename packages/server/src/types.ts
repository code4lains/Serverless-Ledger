import { JwtPayload } from '@ledger/shared';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ENVIRONMENT?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
}

export interface AppVariables {
  user?: JwtPayload;
}

