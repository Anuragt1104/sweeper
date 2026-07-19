import { Maximize2 } from "lucide-react";

export function RailHeading({
  number,
  verb,
  title,
  description,
  id,
  onExpand,
}: {
  number: string;
  verb: string;
  title: string;
  description: string;
  id: string;
  onExpand: () => void;
}) {
  return (
    <header className="rail-heading">
      <span className="rail-number">{number}</span>
      <div className="rail-heading__copy">
        <span>{verb}</span>
        <h2 id={id}>{title}</h2>
        <p>{description}</p>
      </div>
      <button
        type="button"
        className="rail-heading__expand"
        onClick={onExpand}
        aria-label={`Expand ${titleForA11y(verb)} details`}
      >
        <Maximize2 size={12} aria-hidden="true" />
        <span>Expand</span>
      </button>
    </header>
  );
}

function titleForA11y(verb: string): string {
  if (verb === "OBSERVE") return "Observe";
  if (verb === "INTERPRET") return "Interpret";
  return "Act";
}
