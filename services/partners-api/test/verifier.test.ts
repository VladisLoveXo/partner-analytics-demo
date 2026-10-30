import { SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { canReadPartner, type Principal } from "../src/auth/principal.js";
import { createTokenVerifier, type TokenVerifier } from "../src/auth/verifier.js";
import { HttpError } from "../src/errors.js";
import { adminClaims, AUDIENCE, createTestIssuer, ingestClaims, ISSUER, partnerClaims } from "./helpers/jwt.js";

let issuer: Awaited<ReturnType<typeof createTestIssuer>>;
let verify: TokenVerifier;

beforeAll(async () => {
  issuer = await createTestIssuer();
  verify = createTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: issuer.jwks });
});

async function statusOf(token: Promise<string>): Promise<number | undefined> {
  try {
    await verify(await token);
    return undefined;
  } catch (error) {
    return error instanceof HttpError ? error.status : -1;
  }
}

describe("token verification", () => {
  it("turns a valid partner token into a principal", async () => {
    const principal = await verify(await issuer.sign(partnerClaims("alpha")));

    expect(principal).toEqual({
      subject: "user-alpha",
      clientId: "partners-web",
      username: "alpha",
      roles: new Set(["partner"]),
      partnerId: "alpha",
    });
  });

  it("reads service account roles", async () => {
    const principal = await verify(await issuer.sign(ingestClaims));
    expect(principal.roles).toEqual(new Set(["ingest"]));
    expect(principal.partnerId).toBeNull();
  });

  it("rejects a token from another issuer", async () => {
    expect(await statusOf(issuer.sign(adminClaims, { issuer: "http://evil.test/realms/partners" }))).toBe(401);
  });

  it("rejects a token issued for another audience", async () => {
    expect(await statusOf(issuer.sign(adminClaims, { audience: "account" }))).toBe(401);
  });

  it("rejects an expired token", async () => {
    const minuteAgo = Math.floor(Date.now() / 1000) - 60;
    expect(await statusOf(issuer.sign(adminClaims, { expiresAt: minuteAgo }))).toBe(401);
  });

  it("rejects an HS256 token, whatever secret it was signed with", async () => {
    const forged = new SignJWT(adminClaims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("guessed-secret-guessed-secret-32"));
    expect(await statusOf(forged)).toBe(401);
  });

  it("rejects garbage", async () => {
    expect(await statusOf(Promise.resolve("not.a.jwt"))).toBe(401);
  });
});

describe("tenant isolation", () => {
  const principal = (roles: Principal["roles"], partnerId: string | null): Principal => ({
    subject: "s",
    clientId: "c",
    username: null,
    roles,
    partnerId,
  });

  it("lets a partner read only its own data", () => {
    const alpha = principal(new Set(["partner"]), "alpha");
    expect(canReadPartner(alpha, "alpha")).toBe(true);
    expect(canReadPartner(alpha, "beta")).toBe(false);
  });

  it("lets an admin read any partner", () => {
    expect(canReadPartner(principal(new Set(["admin"]), null), "beta")).toBe(true);
  });

  it("denies a partner account without a partner_id claim", () => {
    expect(canReadPartner(principal(new Set(["partner"]), null), "alpha")).toBe(false);
  });

  it("denies a service account", () => {
    expect(canReadPartner(principal(new Set(["ingest"]), null), "alpha")).toBe(false);
  });
});
