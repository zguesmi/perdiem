import { useEffect, useState } from "react";
import type { Hex } from "viem";

import {
  createClient,
  formatUsdc,
  readEnclavePublicKey,
  short,
  shorter,
  type AuctionView,
  type Config,
} from "./auction.ts";

/** `bytes32(0)`, which is what `bidsRoot` reads as until the enclave reports. */
const UNSET = `0x${"0".repeat(64)}`;

/**
 * The keys the auction is checked against, and the USDC that moves.
 *
 * Folded away by default: a reader who trusts the headline never opens it, and a reader who does
 * not gets every figure the contract enforced against.
 */
export function More({ config, auction }: { config: Config; auction: AuctionView }) {
  const enclavePublicKey = useEnclavePublicKey(config);

  const held = [
    { label: "Escrow", address: config.sealedAuction },
    { label: "Travel desk", address: auction.buyer },
    ...auction.bids.map((bid, index) => ({
      label: `Supplier ${String.fromCharCode(65 + index)}`,
      address: bid.supplier,
    })),
  ];

  return (
    <details className="card more">
      <summary>Enclave and balances</summary>
      <div className="more-body">
        <span className="eyebrow">Enclave</span>
        <div className="rows">
          <Row
            label="Enclave public key"
            value={enclavePublicKey ? <code>{short(enclavePublicKey)}</code> : "Not read yet"}
          />
          <Row label="Policy hash" value={<code>{short(auction.policyHash)}</code>} />
          {auction.bidsRoot !== UNSET && (
            <Row label="Bids root" value={<code>{short(auction.bidsRoot)}</code>} />
          )}
        </div>

        <span className="eyebrow">Balances</span>
        <div className="rows">
          {held.map((entry) => (
            <Row
              key={entry.label}
              label={
                <>
                  {entry.label} {entry.address && <code>{shorter(entry.address)}</code>}
                </>
              }
              value={balance(auction, entry.address)}
              mono
            />
          ))}
        </div>
      </div>
    </details>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="row">
      <span className="k">{label}</span>
      <span className={mono ? "v num" : "v"}>{value}</span>
    </div>
  );
}

/** A committer the page never saw a `Committed` log for has no address to read a balance at. */
function balance(auction: AuctionView, address?: string): string {
  const usdc = address ? auction.balances.get(address.toLowerCase()) : undefined;
  return usdc === undefined ? "Not read yet" : formatUsdc(usdc);
}

/** Fixed for the life of the deployment, so one read answers every poll. */
function useEnclavePublicKey(config: Config): Hex | undefined {
  const [key, setKey] = useState<Hex>();

  useEffect(() => {
    let current = true;
    void readEnclavePublicKey(createClient(config), config)
      .then((read) => {
        if (current) {
          setKey(read);
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [config]);

  return key;
}
