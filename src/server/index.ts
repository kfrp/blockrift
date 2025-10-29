/**
 * Server Entry Point
 * Conditionally loads mock server (local dev) or Reddit server (production)
 */

export {};

// Check environment to determine which server to start
const isLocal = process.env.VITE_ENV_MODE === "local";

(async () => {
  if (isLocal) {
    console.log("Starting mock server for local development...");
    const { startServer } = await import("./mock");
    startServer();
  } else {
    // Production: use Reddit/Devvit server
    const { startServer } = await import("./reddit");
    startServer();
  }
})();
