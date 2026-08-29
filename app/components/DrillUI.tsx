import { Icon } from "./icons";
import { LiveFilterForm } from "./LiveFilterForm";

/**
 * Period and order — the controls that choose WHICH ROWS the server fetches.
 *
 * There is no search box here any more, and that is the point. This bar
 * submits a real form, which is a full page navigation; correct for a date
 * range, which selects a different dataset and belongs in the URL, but wrong
 * for search, where it meant a page reload per keystroke. Search now lives in
 * the list components (ListControls, SimActivationList, EntityGrid), filtering
 * rows already in the browser.
 *
 * The date inputs carry no min/max on purpose: a native date input reports ""
 * for any value those attributes reject, which reads as a dead picker. See
 * claude/v102.
 */
export function FilterForm({
  month,
  from,
  to,
  showMonth = true,
  dateRange = false,
  sort,
  sortValue,
}: {
  month?: string;
  from?: string;
  to?: string;
  showMonth?: boolean;
  dateRange?: boolean;
  /** Orders this page offers. Omit on a page whose list has no meaningful order. */
  sort?: { value: string; label: string }[];
  sortValue?: string;
}) {
  return (
    <LiveFilterForm className="kit-filter-bar no-print">
      {/* No search input here, deliberately.

          This bar submits a real form, which is a full page navigation. That
          is the right behaviour for a DATE RANGE — it selects a different
          dataset and belongs in the URL — but it was wrong for search: every
          keystroke reloaded the page. Search now lives in the list components
          (ListControls / SimActivationList), which filter the rows already
          fetched, in the browser, with no request at all.

          `placeholder` is kept only so existing callers still type-check; it
          renders nothing. tests/search-instant.smoke.test.ts fails if a
          search input ever reappears inside a submitting form. */}
      {showMonth && !dateRange ? (
        <label className="kit-field">
          <span>Month</span>
          <input className="kit-input" type="month" name="month" defaultValue={month} />
        </label>
      ) : null}
      {dateRange ? (
        <>
          <label className="kit-field">
            <span>From</span>
            <input className="kit-input" type="date" name="from" defaultValue={from || `${month}-01`} />
          </label>
          <label className="kit-field">
            <span>To</span>
            <input className="kit-input" type="date" name="to" defaultValue={to || ""} />
          </label>
        </>
      ) : null}
      {sort && sort.length > 1 ? (
        <label className="kit-field kit-sort">
          <span>Sort by</span>
          <select className="kit-select" name="sort" defaultValue={sortValue || sort[0].value}>
            {sort.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <span className="kit-filter-note">
        <Icon name="filter" /> Live filter
      </span>
    </LiveFilterForm>
  );
}
