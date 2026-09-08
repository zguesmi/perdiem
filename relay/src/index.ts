import { serve } from "@hono/node-server";

import { createRelayApp } from "./app.ts";

const port = Number(process.env.RELAY_PORT ?? 8787);

serve({ fetch: createRelayApp().fetch, port }, (info) => {
  console.log(`Relay listening on http://localhost:${info.port}`);
});
