import { cre, type TeeRuntime } from "@chainlink/cre-sdk";
import { z } from "zod";

export const configSchema = z.object({
  /** Cron expression with a seconds field. How often the workflow asks the chain for work. */
  schedule: z.string(),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Everything this handler touches stays inside the enclave: the policy, the decrypted bids and the
 * enclave private key. Only the settlement crosses back to the DON. Nothing confidential is ever
 * logged, in simulation or otherwise.
 */
export const onCronTrigger = (runtime: TeeRuntime<Config>): string => {
  runtime.log("enclave reached");

  return "no auction pending";
};

/**
 * The enclave is constrained to the one registered TEE type and region. An unconstrained handler
 * would accept any enclave the DON offers.
 */
export function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability();

  return [
    cre.handlerInTee(cron.trigger({ schedule: config.schedule }), onCronTrigger, [
      { tee: "nitro", regions: ["us-west-2"] },
    ]),
  ];
}
