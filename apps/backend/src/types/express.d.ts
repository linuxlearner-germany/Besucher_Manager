import type { AuthenticatedUser } from "../lib/visitWorkflow";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser | null;
    }
  }
}

export {};
