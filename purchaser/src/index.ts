import { serve } from "@hono/node-server";
import { z } from "zod";

import { createPurchaserApp } from "./app.ts";
import { createCompleter } from "./intent.ts";

const environment = z
  .object({
    PURCHASER_PORT: z.coerce.number().int().positive().default(8788),
    INTENT_MODEL: z.string().min(1).default("claude-opus-5"),
    ANTHROPIC_API_KEY: z.string().min(1),
  })
  .parse(process.env);

const app = createPurchaserApp({ completer: createCompleter(environment.INTENT_MODEL) });

serve({ fetch: app.fetch, port: environment.PURCHASER_PORT }, (info) => {
  console.log(`Purchaser service listening on http://localhost:${info.port}`);
  console.log(`Intent parsing runs on ${environment.INTENT_MODEL}`);
});
