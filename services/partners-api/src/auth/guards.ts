import type { FastifyRequest } from "fastify";
import { forbidden, unauthorized } from "../errors.js";
import { canReadPartner, type Principal, type Role } from "./principal.js";

export function requirePrincipal(request: FastifyRequest): Principal {
  if (request.principal === null) throw unauthorized();
  return request.principal;
}

/** preHandler hook: the caller must hold the role. */
export function requireRole(role: Role) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!requirePrincipal(request).roles.has(role)) throw forbidden(`the ${role} role is required`);
  };
}

export function assertCanReadPartner(principal: Principal, partnerId: string): void {
  if (!canReadPartner(principal, partnerId)) throw forbidden("no access to this partner");
}
