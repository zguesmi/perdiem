import type { AuctionView } from "../auction.ts";

export type PanelProps = { auction: AuctionView };

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
