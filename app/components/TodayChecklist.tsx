/**
 * v206 — "Ajker kaj": the Accounts home's list of what is waiting today.
 * Server-rendered markup only; every item is a link to the page that does it.
 */

import type { TodayList } from "@/lib/accounts-today-types";
import { Card, LinkBtn } from "./Kit";
import { Icon } from "./icons";

const ICON = { bad: "alert", warn: "calendar", info: "info" } as const;
const TONE_WORD = { bad: "Needs fixing", warn: "To do", info: "Worth a look" } as const;

export function TodayChecklist({ list }: { list: TodayList }) {
  const { tasks, done } = list;
  return (
    <Card className="kit-card-p today-card">
      <div className="today-head">
        <div>
          <h2>Today&apos;s work</h2>
          <p>{tasks.length ? `${tasks.length} thing${tasks.length === 1 ? "" : "s"} waiting` : "All caught up"}</p>
        </div>
        <span className={`today-count${tasks.length ? "" : " is-clear"}`} aria-hidden="true">
          {tasks.length ? tasks.length : <Icon name="check" />}
        </span>
      </div>
      {tasks.length ? (
        <ul className="today-list">
          {tasks.map((t) => (
            <li key={t.key} className={`today-item is-${t.tone}`}>
              <span className="today-icon" aria-hidden="true">
                <Icon name={ICON[t.tone]} />
              </span>
              <span className="today-text">
                <strong>{t.title}</strong>
                <span>{t.detail}</span>
              </span>
              <LinkBtn
                href={t.href}
                variant="secondary"
                size="sm"
                className="today-cta"
                aria-label={`${t.cta}: ${t.title} (${TONE_WORD[t.tone]})`}
              >
                {t.cta} <Icon name="arrow" />
              </LinkBtn>
            </li>
          ))}
        </ul>
      ) : null}
      {done.length ? (
        <ul className="today-done">
          {done.map((d) => (
            <li key={d}>
              <Icon name="check" /> {d}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
