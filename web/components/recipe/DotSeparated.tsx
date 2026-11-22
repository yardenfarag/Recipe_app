import { Fragment } from "react";

/**
 * A "450 cal · 30 g protein · 40 g carbs" line that wraps only between its parts, so a number never ends up on a
 * different line from its unit (PIN-80). The parts come from one translated string, split on " · ".
 */
export function DotSeparated({ text }: { text: string }) {
  return text.split(" · ").map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? " · " : null}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ));
}
