import { AuthClaims } from '../middleware/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthClaims;
      token?: string;
    }
  }
}

export {};
