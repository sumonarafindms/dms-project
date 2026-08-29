import { Icon } from "./icons";
import { LiveFilterForm } from "./LiveFilterForm";

/**
 * Search + period filter — migrated to the role-UI kit.
 *
 * The one filter bar for every kit page (it absorbed PerfFilterBar, which was
 * the same component with a narrower prop set). LiveFilterForm underneath
 * keeps the ~280ms debounce, so typing does not fire a request per keystroke
 * and a date change submits at once.
 *
 * The date inputs carry no min/max on purpose: a native date input reports ""
 * for any value those attributes reject, which reads as a dead picker. See
 * claude/v102.
 */
export function FilterForm({
  q = "",
  month,
  from,
  to,
  placeholder = "Search",
  showMonth = true,
  dateRange = false,
}: {
  q?: string;
  month?: string;
  from?: string;
  to?: string;
  placeholder?: string;
  showMonth?: boolean;
  dateRange?: boolean;
}) {
  return (
    <LiveFilterForm className="kit-filter-bar no-print">
      {placeholder ? (
        <div className="kit-search">
          <Icon name="search" />
          <input
            className="kit-input"
            name="q"
            defaultValue={q}
            placeholder={placeholder}
            autoComplete="off"
            aria-label={placeholder}
          />
        </div>
      ) : null}
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
      <span className="kit-filter-note">
        <Icon name="filter" /> Live filter
      </span>
    </LiveFilterForm>
  );
}
