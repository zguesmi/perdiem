import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The development server serves the page, on a laptop and on a public host alike, because Vite
// inlines every `VITE_` variable at startup and the contract address exists only after the
// deployment has run.
//
// Vite answers a request whose `Host` header it does not know with "Blocked request", which is
// what stops a page on another machine from reading this one through DNS rebinding. A public
// deployment names its own host in `UI_ALLOWED_HOSTS`, comma-separated; localhost needs nothing.
const allowedHosts = process.env.UI_ALLOWED_HOSTS?.split(",").filter(Boolean);

export default defineConfig({
  plugins: [react()],
  ...(allowedHosts?.length ? { server: { allowedHosts } } : {}),
});
