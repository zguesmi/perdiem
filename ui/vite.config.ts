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

export default defineConfig({
  plugins: [react()],
  server: { host: true, ...(allowedHosts?.length ? { allowedHosts } : {}) },
});
