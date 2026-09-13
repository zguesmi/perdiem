import { explorerLink, shorter, type Config, type Transaction } from "./auction.ts";
import type { Item, Step, Value } from "./steps.ts";

/**
 * The selected step, and only that one.
 *
 * The headline says what the step did, in the tense it is in. The `i` behind it carries the
 * mechanism for a reader who wants it, and nothing on the page depends on that being read.
 */
export function Detail({ step, config }: { step: Step; config: Config }) {
  return (
    <article className="card detail">
      <div className="headline">
        <span>{step.headline}</span>
        <span className="info" tabIndex={0} data-tip={step.tip}>
          i
        </span>
      </div>
      <div className="rows">
        {step.items.map((item, index) => (
          <Line key={index} item={item} config={config} />
        ))}
      </div>
    </article>
  );
}

function Line({ item, config }: { item: Item; config: Config }) {
  if (item.kind === "row") {
    return (
      <div className="row">
        <span className="k">{item.label}</span>
        <span className={item.value.kind === "text" && item.value.mono ? "v num" : "v"}>
          <Shown value={item.value} config={config} />
        </span>
      </div>
    );
  }

  return (
    <div className="bid">
      <div className="who">
        <span className="addr">{item.address}</span>
        <span className={item.win ? "tag win" : "tag"}>{item.tag}</span>
      </div>
      <div className="meta">
        <span>
          {item.note}
          {item.code && <code> {item.code}</code>}
        </span>
        {item.transaction && <Tx transaction={item.transaction} config={config} />}
      </div>
    </div>
  );
}

function Shown({ value, config }: { value: Value; config: Config }) {
  switch (value.kind) {
    case "code":
      return <code>{value.text}</code>;
    case "tx":
      return <Tx transaction={value.transaction} config={config} />;
    case "link":
      return (
        <a href={value.href} target="_blank" rel="noreferrer">
          {value.code ? <code>{value.text}</code> : value.text}
        </a>
      );
    default:
      return value.text;
  }
}

/** A deployment with no explorer shows the hash as text rather than as a dead link. */
function Tx({ transaction, config }: { transaction: Transaction; config: Config }) {
  const href = explorerLink(config, transaction.hash);
  const label = `#${transaction.blockNumber.toString()} ${shorter(transaction.hash)}`;

  return href ? (
    <a className="tx" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  ) : (
    <span className="tx">{label}</span>
  );
}
