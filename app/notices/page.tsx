/**
 * v203 — the Notice Board.
 *
 * Everyone reads here what is addressed to them. Admin, IT, a Manager and
 * Accounts also post here and take notices down.
 */

import { requireUser } from "../../lib/auth";
import { dhakaTodayYmd } from "../../lib/business-time";
import { NOTICE_POST_ROLES } from "../../lib/notice-rules";
import { noticesFor, noticesToManage } from "../../lib/notices";
import { Card, EmptyState, PageHeader, SectionHead } from "../components/Kit";
import { Icon } from "../components/icons";
import { NoticeCard, NoticeForm, NoticeManager } from "../components/NoticeViews";

export const dynamic = "force-dynamic";

export default async function NoticesPage() {
  const u = await requireUser(["ADMIN", "IT", "MANAGER", "ACCOUNTS", "SUPERVISOR", "RSO", "BP"]);
  const poster = NOTICE_POST_ROLES.includes(u.role);
  const [mine, posted] = await Promise.all([noticesFor(u), poster ? noticesToManage(u) : Promise.resolve([])]);

  return (
    <main className="page">
      <PageHeader
        title="Notice Board"
        subtitle={
          poster
            ? "Post an offer, a meeting or a rule — it shows on the readers' home screens."
            : "Notices from the office. New ones also show on your home screen."
        }
      />

      {poster ? <NoticeForm role={u.role} today={dhakaTodayYmd()} /> : null}

      {!poster || mine.length ? (
        <>
          <SectionHead title="For you" sub="Important ones first, then the newest." />
          {mine.length ? (
            <div className="notice-list kit-mb-20">
              {mine.map((n) => (
                <NoticeCard key={n.id} n={n} />
              ))}
            </div>
          ) : (
            <Card padded className="kit-mb-20">
              <EmptyState
                title="No notices right now"
                hint="Anything the office posts for you will be here."
                icon={<Icon name="info" />}
              />
            </Card>
          )}
        </>
      ) : null}

      {poster ? (
        <>
          <SectionHead
            title={u.role === "MANAGER" ? "Posted by you" : "Every notice"}
            sub="Take one down and it disappears from every home screen at once."
          />
          <NoticeManager rows={posted} />
        </>
      ) : null}
    </main>
  );
}
