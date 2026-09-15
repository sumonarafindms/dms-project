"use client";

/**
 * A select you can type into.
 *
 * ## Why this exists
 *
 * The Add BP form asked for an RSO and then a retailer code from two native
 * `<select>` menus. There are hundreds of RSOs and roughly 2,190 retailers, so
 * choosing one meant scrolling a list with no way to jump to a name — on a
 * phone, which is what ninety per cent of this app's users are holding. The
 * owner's words: *"ai jagai search korar option nai...scroll kore khujte hoi"*.
 *
 * BP Management had already run into this and worked around it with a separate
 * "Find retailer" text box sitting beside the select. That works, but it is two
 * controls for one decision, and it only existed on the one screen somebody had
 * complained about. Following the rule this project learned in v155 — *a hazard
 * that belongs to a control belongs to that control's component, or every new
 * field starts out broken and waits to be spotted* — the searching lives in the
 * picker, and every long list in the app uses the picker.
 *
 * ## What it is, and what it still is underneath
 *
 * A WAI-ARIA combobox: a text input that filters, a listbox of the matches, and
 * a **hidden input carrying the real value**. That last part matters — every
 * form here submits through `new FormData(form)`, so the picker has to put a
 * `name=value` pair in the form exactly as the `<select>` did. Nothing about
 * any API contract changes.
 *
 * `required` is on the visible input rather than the hidden one, because the
 * browser cannot focus a hidden field to report "please fill this in" and logs
 * "An invalid form control is not focusable" instead. That is only correct
 * because of the blur rule below: the visible input is non-empty exactly when
 * something is actually selected.
 *
 * ## Three details that are easy to get wrong
 *
 * 1. **Blur resets the text.** Typing "kam" and clicking away must not leave
 *    "kam" sitting in a field that has selected nothing — the form would look
 *    filled and submit empty. On blur the input goes back to the selected
 *    option's label, or to empty if there is none.
 * 2. **Options select on `mousedown`, not `click`.** A click on an option fires
 *    after the input's blur, by which point the list has closed and the click
 *    lands on nothing.
 * 3. **The list is capped.** Rendering 2,190 options into the DOM on every
 *    keystroke is what makes a picker feel slower than the scrolling it
 *    replaced. It renders the first 50 matches and says how many there are.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { foldDigits } from "../../lib/format";

export type PickerOption = { id: string; label: string; meta?: string };

/** Rendered at once. Enough to browse, small enough to stay instant. */
export const PICKER_LIMIT = 50;

export function matchOptions(options: PickerOption[], query: string) {
  const needle = foldDigits(query.trim().toLowerCase());
  if (!needle) return options;
  // Every word has to appear somewhere, in any order: "kamal 017" finds
  // "KAMAL TELECOM · 01700000001" the way a person expects it to.
  const words = needle.split(/\s+/);
  return options.filter((o) => {
    const hay = foldDigits(`${o.label} ${o.meta ?? ""}`.toLowerCase());
    return words.every((w) => hay.includes(w));
  });
}

export function Picker({
  name,
  options,
  value: controlled,
  defaultValue = "",
  onChange,
  placeholder = "Type to search",
  disabled,
  required,
  emptyText = "No match",
}: {
  name: string;
  options: PickerOption[];
  /** Controlled. Omit it and the picker keeps its own value, like `<select defaultValue>`. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  emptyText?: string;
}) {
  /*
   * Controlled and uncontrolled, because it replaces both shapes of `<select>`
   * this app had: one whose choice drives another field, and one that is only
   * ever read out of the form on submit. An uncontrolled picker that forced a
   * useState into its caller would have meant inventing state in a component
   * that had none — and that is how the wrong value survives a role change.
   */
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const setValue = (id: string) => {
    if (controlled === undefined) setOwn(id);
    onChange?.(id);
  };
  const listId = useId();
  const optionId = (i: number) => `${listId}-o${i}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);
  const labelOf = (o: PickerOption) => (o.meta ? `${o.label} · ${o.meta}` : o.label);
  const matches = useMemo(() => matchOptions(options, open ? query : ""), [options, query, open]);
  const shown = matches.slice(0, PICKER_LIMIT);

  // The text the field shows when it is not being typed into.
  const resting = selected ? labelOf(selected) : "";

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(o: PickerOption) {
    setValue(o.id);
    close();
    input.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (shown.length ? (i + step + shown.length) % shown.length : 0));
      return;
    }
    if (e.key === "Enter" && open) {
      // Only swallowed when the list is open with something under the cursor,
      // so Enter still submits the form the rest of the time.
      if (shown[active]) {
        e.preventDefault();
        choose(shown[active]);
      }
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  }

  return (
    <div className="kit-picker" ref={box}>
      <input type="hidden" name={name} value={value} />
      <input
        ref={input}
        className="kit-input kit-picker-input"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? optionId(active) : undefined}
        autoComplete="off"
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        value={open ? query : resting}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onBlur={() => {
          // Deliberately not clearing the selection: leaving a half-typed
          // string behind is what would make an empty form look filled.
          setOpen(false);
          setQuery("");
        }}
        onKeyDown={onKeyDown}
      />
      <span className="kit-picker-caret" aria-hidden="true" />

      {open && (
        <ul className="kit-picker-list" id={listId} role="listbox">
          {shown.length === 0 && (
            <li className="kit-picker-empty" role="presentation">
              {emptyText}
            </li>
          )}
          {shown.map((o, i) => (
            <li
              key={o.id}
              id={optionId(i)}
              role="option"
              aria-selected={o.id === value}
              className={`kit-picker-option${i === active ? " is-active" : ""}${o.id === value ? " is-chosen" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <strong>{o.label}</strong>
              {o.meta ? <small>{o.meta}</small> : null}
            </li>
          ))}
          {matches.length > PICKER_LIMIT && (
            <li className="kit-picker-more" role="presentation">
              first {PICKER_LIMIT} of {matches.length} — keep typing to narrow it
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
