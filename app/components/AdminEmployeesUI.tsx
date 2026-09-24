"use client";

/**
 * The shared employee directory — migrated to the role-UI kit.
 *
 * One component behind all four role lists (managers / supervisors / rsos /
 * bps). The search stays client-side because these lists are already fully
 * loaded on the server; there is no request to debounce.
 */

import { useState } from "react";
import { matchesTokens } from "../../lib/text-search";
import { Icon } from "./icons";
import { Badge, Card, EmptyState, LinkBtn, Row, SectionHead } from "./Kit";

export type AdminEmployeeRow = {
  id: string;
  name: string;
  mobile: string;
  role: string;
  active: boolean;
  meta: string;
  detail: string;
  editHref: string;
  /** v201: more numbers to find this person by — an RSO's wallet, an outlet's numbers. Searched, not shown. */
  keywords?: string;
};

export function EmployeeList({ title, rows, addHref }: { title: string; rows: AdminEmployeeRow[]; addHref: string }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  // Every word anywhere, and a phone number however it is typed (v201).
  const filtered = rows.filter(
    (x) =>
      !needle || matchesTokens(`${x.name} ${x.mobile} ${x.meta} ${x.detail}`.toLowerCase(), needle, x.keywords ?? ""),
  );
  const active = rows.filter((x) => x.active).length;

  return (
    <>
      <SectionHead
        title={`${rows.length} ${title}`}
        sub={`${active} active · ${rows.length - active} inactive`}
        link={
          <LinkBtn href={addHref} size="sm">
            <Icon name="users" /> Add New
          </LinkBtn>
        }
      />

      <div className="kit-filter-bar no-print">
        <div className="kit-search">
          <Icon name="search" />
          <input
            className="kit-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, code or assignment"
            autoComplete="off"
            aria-label={`Search ${title}`}
          />
        </div>
        <span className="kit-filter-note">{filtered.length} results</span>
      </div>

      <Card padded>
        {filtered.length ? (
          <div className="kit-rows">
            {filtered.map((x) => (
              <Row
                key={x.id}
                href={x.editHref}
                avatar={x.name}
                title={x.name}
                sub={x.meta}
                detail={x.detail}
                after={
                  <div className="kit-row-value">
                    <Badge tone={x.active ? "active" : "inactive"}>{x.active ? "Active" : "Inactive"}</Badge>
                    <span>{x.mobile || "No login"}</span>
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No matching records" hint="Try a different search term." icon={<Icon name="search" />} />
        )}
      </Card>
    </>
  );
}

export function SaveNotice({ message, ok }: { message: string; ok: boolean }) {
  return message ? (
    <div className={ok ? "kit-note is-ok" : "kit-note is-bad"} role="status">
      <Icon name={ok ? "check" : "alert"} />
      <span>{message}</span>
    </div>
  ) : null;
}
