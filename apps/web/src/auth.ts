import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { appConfig } from "./config";

/**
 * Authorization Code flow with PKCE for a public client: the SPA holds no secret,
 * the code verifier proves that the code is redeemed by the same browser tab that asked for it.
 */
export const userManager = new UserManager({
  authority: appConfig.oidcAuthority,
  client_id: appConfig.oidcClientId,
  redirect_uri: `${window.location.origin}/`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  response_type: "code",
  scope: "openid profile",
  // Renews the access token with the refresh token shortly before it expires.
  automaticSilentRenew: true,
  // sessionStorage: survives a reload, not the closed tab, and keeps tokens out of localStorage.
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
});

interface SignInState {
  returnTo: string;
}

/** Remembers the current page, so the login comes back to it. */
export function signInArgs(): { state: SignInState } {
  return { state: { returnTo: window.location.pathname + window.location.search } };
}

/** For code outside React (an expired session in apiFetch). Components go through useAuth(). */
export function signIn(): Promise<void> {
  return userManager.signinRedirect(signInArgs());
}

/** Called after Keycloak redirects back: removes ?code=&state= and returns to the page that needed the login. */
export function onSigninCallback(user: User | undefined): void {
  const returnTo = (user?.state as SignInState | undefined)?.returnTo;
  const safe = returnTo !== undefined && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  window.history.replaceState({}, document.title, safe);
}
