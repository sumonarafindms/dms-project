"use client";

/**
 * The offer as the owner posts it to the field's group, with a copy button.
 *
 * The text is built by `offerMessage` from the saved scheme (or, on the form,
 * from what is being typed), so the message the office pastes and the money the
 * app pays are the same numbers by construction.
 *
 * Clipboard permission varies by browser and context, so when the copy fails
 * the text is selected in place instead — the path that always works.
 */

import { useRef, useState } from "react";
import { Btn } from "./Kit";
import { Icon } from "./icons";

export function SupportOfferMessage({
  text,
  title = "Offer message",
  collapsed,
}: {
  text: string;
  title?: string;
  /** On the day's page the message is a tool, not the content: folded until asked for. */
  collapsed?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const pre = useRef<HTMLPreElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = pre.current;
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }

  const body = (
    <div className="sup-msg">
      <div className="sup-msg-head">
        <span className="kit-label">{title}</span>
        <Btn type="button" variant="secondary" size="sm" onClick={copy}>
          <Icon name={copied ? "check" : "file"} /> {copied ? "Copied" : "Copy for WhatsApp"}
        </Btn>
      </div>
      <pre ref={pre} className="sup-msg-text" aria-label={title}>
        {text}
      </pre>
    </div>
  );
  if (!collapsed) return body;
  return (
    <details className="sup-msg-fold">
      <summary>
        <Icon name="file" /> {title} for WhatsApp
      </summary>
      {body}
    </details>
  );
}
