import { serve } from "@hono/node-server";

import { createPurchaserApp } from "./app.ts";

const port = Number(process.env.PURCHASER_PORT ?? 8788);

serve({ fetch: createPurchaserApp().fetch, port }, (info) => {
  console.log(`Purchaser service listening on http://localhost:${info.port}`);
});
