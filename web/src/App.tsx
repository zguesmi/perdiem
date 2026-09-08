import "./App.css";

/**
 * One page, five panels, top to bottom. Every panel shows a transaction hash or a log line, because
 * the point of the demo is that each step is checkable, not that it looks good.
 */
const panels = [
  {
    title: "Intent",
    detail: "One sentence in. The parsed policy, then the policy hash and the block it was committed in.",
  },
  {
    title: "Funding",
    detail: "Budget, ceiling, the Privy quorum approvals, and the createAuction transaction.",
  },
  {
    title: "Bids",
    detail: "Commitment hashes only until settlement. Prices and attributes afterwards, so the audience sees why the cheapest lost.",
  },
  {
    title: "Enclave",
    detail: "A live tail of the simulation log. The policy never appears here.",
  },
  {
    title: "Settlement",
    detail: "Winner, payout, refund, stake refunds, receipt hash, and the LiteAPI booking response.",
  },
];

export default function App() {
  return (
    <main>
      <h1>Perdiem</h1>
      <p className="lede">Corporate hotel booking where the buyer&rsquo;s selection rules stay private.</p>

      {panels.map((panel) => (
        <section key={panel.title}>
          <h2>{panel.title}</h2>
          <p>{panel.detail}</p>
          <p className="pending">Not implemented yet.</p>
        </section>
      ))}
    </main>
  );
}
