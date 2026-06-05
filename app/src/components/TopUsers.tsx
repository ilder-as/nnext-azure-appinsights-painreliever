import type { KeyboardEvent } from "react";
import { useDashboard } from "@/state/dashboard";
import { avatarFor, displayName, fmtInt, relTime } from "@/lib/format";

/**
 * Top users table — ports renderUsers (app.js:766) and the #usersCard markup
 * (index.html:528). `agg.userStats` is already sorted descending by count, so we
 * just take the top 10. Clicking (or Enter on) a row searches for that user —
 * the original wrote the authId into #searchInput and re-rendered; here that's
 * `setSearch(authId)`.
 */
export function TopUsers() {
  const { agg, derived, openUserSessions } = useDashboard();
  const rows = agg.userStats.slice(0, 10);

  // Click a user → jump to their session traces over time.
  const apply = (authId: string) => openUserSessions(authId);
  const onKeyDown =
    (authId: string) => (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        apply(authId);
      }
    };

  return (
    <section className="card" id="usersCard">
      <div className="card-head">
        <h2>Top users</h2>
        <span className="sub">by event count</span>
      </div>
      <div className="table-wrap" style={{ maxHeight: 300 }}>
        <table className="dt">
          <thead>
            <tr>
              <th>User</th>
              <th className="num-h" style={{ textAlign: "right" }}>
                Events
              </th>
              <th style={{ textAlign: "right" }}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={3}>
                  <div className="empty" style={{ padding: 24 }}>
                    <h3>No users</h3>
                    <p>No authenticated users in this slice.</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map(({ authId, count, last }) => {
                const av = avatarFor(authId);
                return (
                  <tr
                    key={authId}
                    data-user={authId}
                    tabIndex={0}
                    onClick={() => apply(authId)}
                    onKeyDown={onKeyDown(authId)}
                  >
                    <td>
                      <div className="user-cell">
                        <span
                          className="avatar"
                          style={{ background: av.color }}
                        >
                          {av.init}
                        </span>
                        <span className="user-name">{displayName(authId)}</span>
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>
                      {fmtInt(count)}
                    </td>
                    <td
                      className="muted ts-cell"
                      style={{ textAlign: "right" }}
                    >
                      {relTime(last, derived.now)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
