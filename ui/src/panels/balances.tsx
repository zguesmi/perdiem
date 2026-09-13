import { formatUsdc, short, type AuctionView, type Config } from "../auction.ts";
import { Field, Panel } from "./panel.tsx";

/**
 * The USDC that moves, re-read on every poll.
 *
 * The escrow row is the one that tells the story: the payout cap plus one stake per commitment
 * while bidding runs, and nothing at all once the auction is finalized or refunded.
 */
export function Balances({ config, auction }: { config: Config; auction: AuctionView }) {
  const rows: { label: string; address?: string }[] = [
    { label: "Escrow", address: config.sealedAuction },
    { label: "Buyer", address: auction.buyer },
    ...auction.bids.map((bid, index) => ({
      label: bid.supplier ? `Supplier ${short(bid.supplier)}` : `Supplier ${index + 1}`,
      address: bid.supplier,
    })),
  ];

  return (
    <Panel
      title="Balances"
      note="Every terminal path returns exactly what entered: the payout cap and one stake per commitment."
    >
      {rows.map((row) => (
        <Field key={row.label} label={row.label} value={balance(auction, row.address)} />
      ))}
    </Panel>
  );
}

/** A committer the page never saw a `Committed` log for has no address to read a balance at. */
function balance(auction: AuctionView, address?: string): string {
  const usdc = address ? auction.balances.get(address.toLowerCase()) : undefined;
  return usdc === undefined ? "Not read yet" : formatUsdc(usdc);
}
