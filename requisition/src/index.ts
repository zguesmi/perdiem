import { serve } from "@hono/node-server";

import { createRequisitionApp } from "./app.ts";

const port = Number(process.env.REQUISITION_PORT ?? 8788);

serve({ fetch: createRequisitionApp().fetch, port }, (info) => {
  console.log(`Requisition service listening on http://localhost:${info.port}`);
});
