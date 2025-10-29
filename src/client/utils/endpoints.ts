import * as ENDPOINTS_IMPORT from "../../shared/endpoints";
const ENDPOINTS = { ...ENDPOINTS_IMPORT };
if (import.meta.env.VITE_ENV_MODE === "local") {
  window.DEV_MODE = "local";
  for (const key in ENDPOINTS) {
    if (Object.prototype.hasOwnProperty.call(ENDPOINTS, key)) {
      (ENDPOINTS as any)[key] =
        "http://localhost:3000" + (ENDPOINTS as any)[key];
    }
  }
}
export default ENDPOINTS;
