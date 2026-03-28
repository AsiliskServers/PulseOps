import type { FastifyReply, FastifyRequest } from "fastify";

export type SessionUser = {
  id: string;
  email: string;
};

export function getSessionUser(request: FastifyRequest): SessionUser | null {
  return request.session.user ?? null;
}

export async function requireSessionUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<SessionUser | null> {
  const user = getSessionUser(request);

  if (!user) {
    reply.status(401).send({ message: "Authentication required" });
    return null;
  }

  return user;
}
