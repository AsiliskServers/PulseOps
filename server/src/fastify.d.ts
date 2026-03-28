import type { SessionUser } from "./lib/session.js";

declare module "fastify" {
  interface Session {
    user?: SessionUser;
  }
}
