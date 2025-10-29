import * as ENDPOINTS_IMPORT from "../shared/endpoints";
declare global {
  interface Window {
    DEV_MODE: "local" | undefined;
    ENDPOINTS: {
      [K in keyof typeof ENDPOINTS_IMPORT]: string;
    };
  }
}
