export interface ClientCredentials {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface TokenSource {
  get(): Promise<string>;
  /** Drops the cached token, for example after a 401. */
  reset(): void;
}

/** OAuth 2.0 client credentials grant: a service account, no user involved. */
export function clientCredentials(credentials: ClientCredentials): TokenSource {
  let cached: { token: string; expiresAt: number } | null = null;

  return {
    async get() {
      // Renew a little before expiry so a request never leaves with a token that dies on the way.
      if (cached !== null && Date.now() < cached.expiresAt - 30_000) return cached.token;
      const response = await fetch(credentials.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
        }),
      });
      if (!response.ok) throw new Error(`token request failed: ${response.status} ${await response.text()}`);
      const body = (await response.json()) as { access_token: string; expires_in: number };
      cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
      return cached.token;
    },
    reset() {
      cached = null;
    },
  };
}
