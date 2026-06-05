import type { JSX } from "react";

/**
 * Render a pre-ESCAPED HTML string (from format.ts summarize/syntaxJson/etc.).
 * Those helpers escape every dynamic value, so this is XSS-safe by construction.
 */
export function Html({
  html,
  as = "span",
  className,
  title,
}: {
  html: string;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
  title?: string;
}) {
  const Tag = as as "span";
  return (
    <Tag
      className={className}
      title={title}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
