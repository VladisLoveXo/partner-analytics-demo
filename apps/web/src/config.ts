export interface AppConfig {
  oidcAuthority: string;
  oidcClientId: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<AppConfig>;
  }
}

/** Read at runtime from /config.js, so one image works in compose, kind and anywhere else. */
export const appConfig: AppConfig = {
  oidcAuthority: window.__APP_CONFIG__?.oidcAuthority ?? "http://localhost:8080/realms/partners",
  oidcClientId: window.__APP_CONFIG__?.oidcClientId ?? "partners-web",
};
