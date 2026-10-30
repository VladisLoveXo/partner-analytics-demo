import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";

export const ISSUER = "http://idp.test/realms/partners";
export const AUDIENCE = "partners-api";

export interface SignOptions {
  issuer?: string;
  audience?: string;
  /** Absolute expiry in epoch seconds, or a jose time span such as "5m". */
  expiresAt?: number | string;
}

/** A local stand-in for Keycloak: an RS256 key pair and its JWKS, no network involved. */
export async function createTestIssuer() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" }],
  });

  function sign(claims: JWTPayload, options: SignOptions = {}): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(options.issuer ?? ISSUER)
      .setAudience(options.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(options.expiresAt ?? "5m")
      .sign(privateKey);
  }

  return { jwks, sign };
}

export function partnerClaims(partnerId: string): JWTPayload {
  return {
    sub: `user-${partnerId}`,
    azp: "partners-web",
    preferred_username: partnerId,
    partner_id: partnerId,
    realm_access: { roles: ["partner", "default-roles-partners"] },
  };
}

export const adminClaims: JWTPayload = {
  sub: "user-admin",
  azp: "partners-web",
  preferred_username: "admin",
  realm_access: { roles: ["admin"] },
};

export const ingestClaims: JWTPayload = {
  sub: "service-account-event-generator",
  azp: "event-generator",
  realm_access: { roles: ["ingest"] },
};
