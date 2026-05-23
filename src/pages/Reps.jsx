import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { Eye, Mail, UserPlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import PortalShell from "@/components/PortalShell";
import { titleCase } from "@/components/calculator/calculations";

export default function Reps() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
    enabled: isAdmin,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-updated_date"),
    enabled: isAdmin,
  });

  const isLoading = usersLoading || projectsLoading;

  const reps = useMemo(() => {
    const stats = new Map();
    for (const p of projects) {
      const email = p.created_by;
      if (!email) continue;
      const e = stats.get(email) || {
        count: 0,
        lastActivity: 0,
        statuses: { draft: 0, submitted: 0, approved: 0, shipped: 0 },
      };
      e.count++;
      if (e.statuses[p.status] != null) e.statuses[p.status]++;
      const t = p.updated_date ? new Date(p.updated_date).getTime() : 0;
      if (t > e.lastActivity) e.lastActivity = t;
      stats.set(email, e);
    }
    return users
      .filter((u) => u.role !== "admin")
      .map((u) => {
        const s = stats.get(u.email) || {
          count: 0,
          lastActivity: 0,
          statuses: { draft: 0, submitted: 0, approved: 0, shipped: 0 },
        };
        return {
          email: u.email,
          fullName: u.full_name || "",
          count: s.count,
          lastActivity: s.lastActivity,
          statuses: s.statuses,
        };
      })
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [users, projects]);

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);
    try {
      // Use the runtime endpoint (base44.users.inviteUser) — the auth-module
      // version (`auth.inviteUser`) hits an admin-panel route that 401s for
      // calls from a custom app, even with a valid admin Bearer token.
      await base44.users.inviteUser(email, "user");
      toast.success(`Invitation sent to ${email}`);
      setInviteEmail("");
      setInviteOpen(false);
    } catch (e) {
      toast.error(e?.message || "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const viewAs = (email) => {
    navigate(`/estimates?as=${encodeURIComponent(email)}`);
  };

  const filterTo = (email) => {
    navigate(`/estimates?rep=${encodeURIComponent(email)}`);
  };

  if (!isAdmin) {
    return (
      <PortalShell>
        <h1 className="sr-only">Reps</h1>
        <div className="px-[15px] pt-[92px] pb-8 flex-1 flex items-center justify-center">
          <div className="text-sm text-foreground/50">
            This page is only available to administrators.
          </div>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      <h1 className="sr-only">Reps</h1>
      <div className="px-[15px] pt-[92px] pb-8 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="text-sm text-foreground/60">
            <span className="font-medium text-foreground tabular-nums">
              {reps.length}
            </span>{" "}
            active {reps.length === 1 ? "rep" : "reps"}
          </div>
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[3px] bg-foreground text-background text-sm font-medium leading-none hover:bg-foreground/90 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            Invite rep
          </button>
        </div>

        {inviteOpen && (
          <InviteRow
            email={inviteEmail}
            onEmailChange={setInviteEmail}
            onSubmit={handleInvite}
            onCancel={() => {
              setInviteOpen(false);
              setInviteEmail("");
            }}
            busy={inviting}
          />
        )}

        <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-[10px]">
          <table className="w-full text-sm" role="grid">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b border-border text-xs uppercase tracking-wider text-foreground/50">
                <th className="text-left font-medium px-4 py-3">Rep</th>
                <th className="text-right font-medium px-4 py-3">Total</th>
                <th className="text-right font-medium px-4 py-3">Draft</th>
                <th className="text-right font-medium px-4 py-3">Submitted</th>
                <th className="text-right font-medium px-4 py-3">Approved</th>
                <th className="text-right font-medium px-4 py-3">Shipped</th>
                <th className="text-right font-medium px-4 py-3">Last activity</th>
                <th className="w-12 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-foreground/40">
                    Loading…
                  </td>
                </tr>
              ) : reps.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-foreground/40">
                    No reps yet. Invite your first rep using the button above.
                  </td>
                </tr>
              ) : (
                reps.map((r) => (
                  <tr
                    key={r.email}
                    data-testid="reps-row"
                    className="border-b border-border last:border-b-0 hover:bg-foreground/[0.02] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => filterTo(r.email)}
                        className="text-left max-w-full truncate"
                      >
                        <div className="font-medium text-foreground hover:underline truncate">
                          {r.fullName ? titleCase(r.fullName) : r.email}
                        </div>
                        {r.fullName && (
                          <div className="text-xs text-foreground/40 truncate">
                            {r.email}
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.count}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground/60">
                      {r.statuses.draft}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground/60">
                      {r.statuses.submitted}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground/60">
                      {r.statuses.approved}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground/60">
                      {r.statuses.shipped}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-foreground/50 tabular-nums">
                      {r.lastActivity
                        ? format(new Date(r.lastActivity), "MMM d, yyyy")
                        : <span className="text-foreground/30">No activity</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => viewAs(r.email)}
                        aria-label={`View as ${r.email}`}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-[3px] border border-border text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors"
                        title={`View as ${r.email}`}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PortalShell>
  );
}

function InviteRow({ email, onEmailChange, onSubmit, onCancel, busy }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mb-3 flex items-center gap-3 px-4 h-12 bg-foreground/5 border border-border rounded-[3px]"
    >
      <Mail className="h-4 w-4 text-foreground/40" aria-hidden="true" />
      <input
        type="email"
        autoFocus
        autoComplete="off"
        name="invite-email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder="rep@example.com"
        aria-label="Rep email"
        className="no-autofill-bg flex-1 h-8 bg-transparent text-sm focus:outline-none placeholder:text-foreground/30"
      />
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="inline-flex items-center h-8 px-3 rounded-[3px] bg-foreground text-background text-sm font-medium leading-none hover:bg-foreground/90 disabled:opacity-50 transition-colors"
      >
        {busy ? "Sending…" : "Send invite"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center h-8 px-3 rounded-[3px] text-sm text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}
