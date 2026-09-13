import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  // Arc is not in the plugin's registry, so the explorer it verifies against is named here.
  chainDescriptors: {
    5042002: {
      name: "Arc testnet",
      blockExplorers: {
        blockscout: {
          name: "Arcscan",
          url: "https://testnet.arcscan.app",
          apiUrl: "https://testnet.arcscan.app/api",
        },
      },
    },
  },
  verify: {
    blockscout: {
      enabled: true,
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    // The node a local deployment targets. It is the loopback address when the node and the deploy
    // run on one machine, and a service name when each runs in its own container.
    localhost: {
      type: "http",
      chainType: "l1",
      url: process.env.DOCKER_LOCALHOST_URL ?? "http://127.0.0.1:8545",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    arcTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 5042002,
      url: "https://rpc.testnet.arc.io",
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
