export type { RealtimeConnection } from "./reddit";
import { connectRealtime as mockConnectRealtime } from "./mock";
import { connectRealtime as redditConnectRealtime } from "./reddit";
let connectRealtime: typeof redditConnectRealtime;

if (import.meta.env.VITE_ENV_MODE === "local") {
  connectRealtime =
    mockConnectRealtime as unknown as typeof redditConnectRealtime;
} else {
  connectRealtime = redditConnectRealtime;
}
export { connectRealtime };
