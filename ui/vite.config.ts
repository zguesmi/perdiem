import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The development server serves the page, on a laptop and on a public host alike, because Vite
// inlines every `VITE_` variable at startup and the contract address exists only after the
// deployment has run.
//
// `host` is here rather than on the command line because Vite 8 keeps the server on loopback
// through `--host 0.0.0.0`, and a container that answers only its own loopback answers nothing
// through a published port.
//
// Vite answers a request whose `Host` header it does not know with "Blocked request", which is
// what stops a page on another machine from reading this one through DNS rebinding. A public
// deployment names its own host in `UI_ALLOWED_HOSTS`, comma-separated; localhost needs nothing.
const allowedHosts = process.env.UI_ALLOWED_HOSTS?.split(",").filter(Boolean);

// The page reads the chain through `/rpc` on its own origin, and the server forwards that to
// `ARC_RPC_URL`. Same origin, so no node has to answer a cross-origin request, and a browser that
// cannot reach the node itself still reads the auction.
const rpcUrl = process.env.ARC_RPC_URL;

if (!rpcUrl) {
  throw new Error("ARC_RPC_URL is not set. Source the deployment's environment file first.");
}

// The booking API takes a key, and a key in the bundle is a key anyone can spend. The page asks its
// own origin for `/booking/{id}` and `/hotel?hotelId=…`, and the server is what holds the key.
const bookingUrl = process.env.BOOKING_URL;
const bookingApiKey = process.env.BOOKING_API_KEY;

if (!bookingUrl || !bookingApiKey) {
  throw new Error(
    "BOOKING_URL and BOOKING_API_KEY are not set. Source the deployment's environment file first.",
  );
}

const booking = {
  target: bookingUrl,
  changeOrigin: true,
  headers: { "X-API-Key": bookingApiKey },
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    ...(allowedHosts?.length ? { allowedHosts } : {}),
    proxy: {
      "/rpc": { target: rpcUrl, changeOrigin: true, rewrite: () => "/" },
      "/booking": { ...booking, rewrite: (path) => path.replace(/^\/booking/, "/bookings") },
      "/hotel": { ...booking, rewrite: (path) => path.replace(/^\/hotel/, "/data/hotel") },
    },
  },
});
