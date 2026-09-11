import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * The local deployment: a stand-in USDC, `SealedAuction` bound to it, and a USDC balance for the
 * buyer and the three suppliers.
 *
 * Ignition records what it deployed under `ignition/deployments/`, so re-running against the same
 * node changes nothing. A restarted node is a new chain, and Ignition wipes the record and starts
 * over.
 *
 * `scripts/deploy.ts` supplies the parameters. Nothing here reads the environment, so the module
 * stays a description of what to deploy and nothing else.
 */

/**
 * USDC minted to each account, in minor units. One figure for everyone, well above the 750 payout
 * cap a buyer locks and the 50 stake a supplier locks, so one node serves many auctions.
 */
export const GRANT = 10_000_000_000n;

/** The accounts that get a balance. Each name is also the module parameter holding its address. */
export const FUNDED = ["buyer", "supplier1", "supplier2", "supplier3"] as const;

const localDeployment = buildModule("LocalDeployment", (m) => {
  const forwarder = m.getParameter("forwarder");
  const enclavePublicKey = m.getParameter("enclavePublicKey");

  const usdc = m.contract("MockUSDC");
  const sealedAuction = m.contract("SealedAuction", [usdc, forwarder, enclavePublicKey]);

  for (const account of FUNDED) {
    m.call(usdc, "mint", [m.getParameter(account), GRANT], { id: `mint_${account}` });
  }

  return { usdc, sealedAuction };
});

export default localDeployment;
