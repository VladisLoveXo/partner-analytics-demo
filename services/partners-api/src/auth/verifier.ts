import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { HttpError, unauthorized } from "../errors.js";
import { isRole, type Principal } from "./principal.js";

export interface VerifierOptions {
  /** Must equal the `iss` claim exactly: the public URL of the realm. */
  issuer: string;
  /** Must be present in the `aud` claim: a token for another API is not accepted here. */
  audience: string;
  jwks: JWTVerifyGetKey;
}

export type TokenVerifier = (token: string) => Promise<Principal>;

/**
 * Keys are fetched by URL and cached. Inside Docker or Kubernetes this is an internal address,
 * while the issuer stays the public one that the browser saw.
 */
export function remoteJwks(url: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(url), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });
}

export function createTokenVerifier(options: VerifierOptions): TokenVerifier {
  return async (token) => {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, options.jwks, {
        issuer: options.issuer,
        audience: options.audience,
        // Pinning the algorithm closes the alg confusion attacks (HS256 signed with a public key, "none").
        algorithms: ["RS256"],
        clockTolerance: 5,
      }));
    } catch (error) {
      // Failing to fetch the keys is our problem, not a bad token.
      if (error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError)) {
        throw new HttpError(503, "idp_unavailable", "identity provider is unavailable");
      }
      throw unauthorized("invalid or expired access token");
    }
    return toPrincipal(payload);
  };
}

function toPrincipal(payload: JWTPayload): Principal {
  if (typeof payload.sub !== "string" || payload.sub === "") throw unauthorized("token has no subject");
  const realmAccess = payload.realm_access as { roles?: unknown } | undefined;
  const roles = Array.isArray(realmAccess?.roles) ? realmAccess.roles.filter(isRole) : [];
  return {
    subject: payload.sub,
    clientId: typeof payload.azp === "string" ? payload.azp : "",
    username: typeof payload.preferred_username === "string" ? payload.preferred_username : null,
    roles: new Set(roles),
    partnerId: typeof payload.partner_id === "string" && payload.partner_id !== "" ? payload.partner_id : null,
  };
}
