import type { Hex } from "viem";

import { explorerLink, short, type AuctionView, type Config } from "../auction.ts";

export type PanelProps = { config: Config; auction: AuctionView };

export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2>{title}</h2>
      <p className="note">{note}</p>
      {children}
    </section>
  );
}

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="field">
      <span className="label">{label}</span>
      <span>{value}</span>
    </p>
  );
}

/** A deployment with no explorer shows the hash as text rather than a dead link. */
export function TransactionLink({
  config,
  label,
  hash,
}: {
  config: Config;
  label: string;
  hash?: Hex;
}) {
  if (!hash) {
    return null;
  }
  const href = explorerLink(config, hash);

  return (
    <p className="field">
      <span className="label">{label}</span>
      <span>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            <code>{short(hash)}</code>
          </a>
        ) : (
          <code>{short(hash)}</code>
        )}
      </span>
    </p>
  );
}
