export const ROLES = ["partner", "admin", "ingest"] as const;

export type Role = (typeof ROLES)[number];

/** Who is calling, as read from a verified access token. */
export interface Principal {
  subject: string;
  /** `azp`: the OIDC client the token was issued to. */
  clientId: string;
  username: string | null;
  roles: ReadonlySet<Role>;
  /** Tenant of a partner user, from the `partner_id` claim. */
  partnerId: string | null;
}

export function isRole(value: unknown): value is Role {
  return (ROLES as readonly unknown[]).includes(value);
}

/** The one place that decides tenant isolation: a partner sees only its own data, an admin sees all. */
export function canReadPartner(principal: Principal, partnerId: string): boolean {
  if (principal.roles.has("admin")) return true;
  return principal.roles.has("partner") && principal.partnerId !== null && principal.partnerId === partnerId;
}
