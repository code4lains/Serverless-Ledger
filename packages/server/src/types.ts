import { JwtPayload } from '@ledger/shared';

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ENVIRONMENT?: string;
}

export interface AppVariables {
  user?: JwtPayload;
}

