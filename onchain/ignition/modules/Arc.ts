import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * The Arc deployment: `SealedAuction` alone, bound to the USDC already on the chain.
 *
 * Arc carries a real USDC, so nothing is deployed for it and nobody is minted a balance. The
 * buyer and the suppliers hold what the faucet gave them.
 *
 * `scripts/deploy.ts` supplies the parameters. Nothing here reads the environment, so the module
 * stays a description of what to deploy and nothing else.
 */
const arcDeployment = buildModule("ArcDeployment", (m) => {
  const sealedAuction = m.contract("SealedAuction", [
    m.getParameter("usdc"),
    m.getParameter("forwarder"),
    m.getParameter("enclavePublicKey"),
  ]);

  return { sealedAuction };
});

export default arcDeployment;
