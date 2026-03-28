import type { FastifyReply, FastifyRequest } from "fastify";

export function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

export function requireAgentToken(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedToken: string
): boolean {
  const providedToken = extractBearerToken(request);

  if (!providedToken || providedToken !== expectedToken) {
    reply.status(401).send({ message: "Invalid agent token" });
    return false;
  }

  return true;
}
