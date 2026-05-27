import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound, PlugZap, RefreshCw, CheckCircle2, XCircle, Pencil, Eraser } from "lucide-react";
import PortalShell from "@/components/PortalShell";

// Brand tokens (see memory:alkimi-brand-tokens).
const INK = "#252320";
const MUTED = "#7A736B";
const SURFACE_BORDER = "#DDDCDA";
const PRIMARY = "#35790B";

// SECRET-EXPOSURE NOTE (task #30 — 2026-05-27):
// This page used to read raw access_token / refresh_token / client_secret via
// base44.entities.IntegrationConfig.filter() and hold them in React state.
// That round-tripped secrets through admin browser memory + network responses.
// Refactored to use admin-only server functions that return only the REDACTED
// shape (booleans + last-4 hint + non-secret client_id + expiry + notes).
// Tokens travel one direction only: browser -> server. They never come back.
//
// Functions used:
//   - getIntegrationConfigRedacted   (READ — redacted only)
//   - updateIntegrationConfigSettings (WRITE — server-side sanitize + store)
//   - refreshSOSToken                (manual OAuth refresh)
//   - testSOSConnection              (existing; ping + verify)

const SERVICE = "SOS";

// Field metadata — used to render the masked-vs-edit UX consistently.
// Each entry: { key, label, type, isSecret, helpText }.
const FIELD_DEFS = [
  { key: "access_token",  label: "Access Token",  type: "password", isSecret: true,  help: "Bearer token used for API calls" },
  { key: "refresh_token", label: "Refresh Token", type: "password", isSecret: true,  help: "Used to mint a new access token on expiry" },
  { key: "client_id",     label: "Client ID",     type: "text",     isSecret: false, help: "OAuth app identifier (not a secret)" },
  { key: "client_secret", label: "Client Secret", type: "password", isSecret: true,  help: "OAuth app secret" },
];

export default function Settings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastTest, setLastTest] = useState(null);

  // Redacted view of the saved config. Never contains raw tokens.
  const [config, setConfig] = useState(null);

  // Per-field draft values (only the fields the admin is currently editing).
  // Cleared after a successful save. Never holds previously-saved tokens.
  const [drafts, setDrafts] = useState({});

  // Per-field "is editing?" toggle. The default state shows the redacted
  // hint; clicking Update reveals an empty input.
  const [editing, setEditing] = useState({});

  // Notes draft is initialized from the redacted config (notes is not secret).
  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (cancelled) return;
        setUser(me);
        if (me?.role === "admin") {
          await reloadConfig();
        }
      } catch (err) {
        toast.error(`Failed to load settings: ${err?.message || err}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const reloadConfig = async () => {
    const response = await base44.functions.invoke("getIntegrationConfigRedacted", { service: SERVICE });
    const result = response?.data;
    if (!result?.ok) throw new Error(result?.error || "Failed to load config");
    setConfig(result.config);
    setNotesDraft(result.config.notes || "");
    setNotesDirty(false);
    setDrafts({});
    setEditing({});
    return result.config;
  };

  const handleSave = async () => {
    // Build updates object from the drafts only — fields the admin actually
    // touched. Notes is included when dirty.
    const updates = {};
    for (const def of FIELD_DEFS) {
      if (def.key in drafts) {
        updates[def.key] = drafts[def.key];
      }
    }
    if (notesDirty) {
      updates.notes = notesDraft;
    }
    if (Object.keys(updates).length === 0) {
      toast.info("No changes to save");
      return;
    }

    setSaving(true);
    setLastTest(null);
    try {
      const response = await base44.functions.invoke("updateIntegrationConfigSettings", {
        service: SERVICE,
        updates,
      });
      const result = response?.data;
      if (!result?.ok) throw new Error(result?.error || "Save failed");
      // Refresh from server — never hold the raw values we just sent.
      setConfig(result.config);
      setNotesDraft(result.config.notes || "");
      setNotesDirty(false);
      setDrafts({});
      setEditing({});
      toast.success("Settings saved");
    } catch (err) {
      toast.error(`Save failed: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setLastTest(null);
    try {
      const { data } = await base44.functions.invoke("testSOSConnection", {});
      const result = data ?? {};
      if (result.ok) {
        setLastTest({ ok: true, message: `Connected (HTTP ${result.status})` });
        toast.success("SOS connection OK");
      } else {
        const msg = result.error || `HTTP ${result.status || "?"}`;
        setLastTest({ ok: false, message: msg });
        toast.error(`SOS test failed: ${msg}`);
      }
    } catch (err) {
      const msg = err?.message || String(err);
      setLastTest({ ok: false, message: msg });
      toast.error(`SOS test failed: ${msg}`);
    } finally {
      setTesting(false);
    }
  };

  const handleRefreshToken = async () => {
    setRefreshing(true);
    setLastTest(null);
    try {
      const response = await base44.functions.invoke("refreshSOSToken", {});
      const result = response?.data;
      if (!result?.ok) throw new Error(result?.error || "Refresh failed");
      setConfig(result.config);
      toast.success("Access token refreshed");
    } catch (err) {
      toast.error(`Refresh failed: ${err?.message || err}`);
    } finally {
      setRefreshing(false);
    }
  };

  const startEdit = (key) => {
    setEditing({ ...editing, [key]: true });
    setDrafts({ ...drafts, [key]: "" });
  };

  const cancelEdit = (key) => {
    const nextEditing = { ...editing };
    delete nextEditing[key];
    setEditing(nextEditing);
    const nextDrafts = { ...drafts };
    delete nextDrafts[key];
    setDrafts(nextDrafts);
  };

  const setDraft = (key, value) => {
    setDrafts({ ...drafts, [key]: value });
  };

  const clearField = (key) => {
    // Mark the field for clearing (empty string sent to server == clear).
    setEditing({ ...editing, [key]: true });
    setDrafts({ ...drafts, [key]: "" });
  };

  if (loading) {
    return (
      <PortalShell>
        <div className="flex items-center justify-center h-64">
          <div
            className="w-6 h-6 border-4 rounded-full animate-spin"
            style={{ borderColor: SURFACE_BORDER, borderTopColor: INK }}
          />
        </div>
      </PortalShell>
    );
  }

  if (user?.role !== "admin") {
    return (
      <PortalShell>
        <div className="flex items-center justify-center h-64 text-sm" style={{ color: MUTED }}>
          Access restricted to administrators.
        </div>
      </PortalShell>
    );
  }

  const hasUnsavedChanges = Object.keys(drafts).length > 0 || notesDirty;
  const configured = config && (config.has_access_token || config.has_refresh_token || config.has_client_id || config.has_client_secret);
  const tokenExpiry = config?.token_expires_at ? new Date(config.token_expires_at) : null;
  const tokenExpiryDisplay = tokenExpiry && !Number.isNaN(tokenExpiry.getTime())
    ? tokenExpiry.toLocaleString()
    : null;

  return (
    <PortalShell>
      <div className="max-w-2xl mx-auto pt-[92px] px-8 pb-8 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" style={{ color: MUTED }} />
              <div className="flex-1">
                <CardTitle className="text-base" style={{ color: INK }}>SOS Inventory</CardTitle>
                <CardDescription className="text-xs mt-0.5" style={{ color: MUTED }}>
                  OAuth credentials for the SOS Inventory API integration.
                  Tokens are stored server-side and never sent back to the browser.
                </CardDescription>
              </div>
            </div>
            {configured && (
              <div className="mt-3 text-xs flex items-center gap-3" style={{ color: MUTED }}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PRIMARY }} />
                  Configured
                </span>
                {tokenExpiryDisplay && (
                  <span>Access token expires {tokenExpiryDisplay}</span>
                )}
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {FIELD_DEFS.map((def) => {
              const isEditing = !!editing[def.key];
              const draftValue = drafts[def.key] ?? "";
              const has = !!config?.[`has_${def.key}`];
              // client_id is not a secret — show the full value when not editing
              const displayWhenNotEditing = def.key === "client_id"
                ? (config?.client_id || (has ? "(set)" : "Not set"))
                : def.key === "access_token"
                  ? (config?.access_token_last4 || (has ? "(set)" : "Not set"))
                  : (has ? "(set)" : "Not set");

              return (
                <div key={def.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={def.key}>{def.label}</Label>
                    {isEditing ? (
                      <button
                        type="button"
                        onClick={() => cancelEdit(def.key)}
                        className="text-xs hover:underline"
                        style={{ color: MUTED }}
                      >
                        Cancel
                      </button>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => startEdit(def.key)}
                          className="text-xs inline-flex items-center gap-1 hover:underline"
                          style={{ color: INK }}
                        >
                          <Pencil className="h-3 w-3" />
                          {has ? "Update" : "Set"}
                        </button>
                        {has && (
                          <button
                            type="button"
                            onClick={() => clearField(def.key)}
                            className="text-xs inline-flex items-center gap-1 hover:underline"
                            style={{ color: MUTED }}
                          >
                            <Eraser className="h-3 w-3" />
                            Clear
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {isEditing ? (
                    <Input
                      id={def.key}
                      type={def.type}
                      autoComplete="off"
                      value={draftValue}
                      onChange={(e) => setDraft(def.key, e.target.value)}
                      placeholder={def.help}
                    />
                  ) : (
                    <div
                      className="text-sm font-mono px-3 py-2 rounded-md"
                      style={{
                        backgroundColor: "#EAEAE7",
                        color: has ? INK : MUTED,
                        border: `1px solid ${SURFACE_BORDER}`,
                      }}
                    >
                      {displayWhenNotEditing}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="space-y-1.5 pt-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                type="text"
                value={notesDraft}
                onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
                placeholder="Admin notes (e.g. 'Sandbox account; rotate before prod cutover')"
              />
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
                className="flex-1 gap-2"
                style={{ backgroundColor: INK, color: "#FFFFFF" }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                onClick={handleTest}
                disabled={testing || !configured}
                variant="outline"
                className="flex-1 gap-2"
                title={!configured ? "Save credentials first" : "Ping SOS to verify the saved credentials"}
              >
                <PlugZap className="h-4 w-4" />
                {testing ? "Testing..." : "Test Connection"}
              </Button>
              <Button
                onClick={handleRefreshToken}
                disabled={refreshing || !config?.has_refresh_token || !config?.has_client_secret}
                variant="outline"
                className="flex-1 gap-2"
                title={
                  !config?.has_refresh_token || !config?.has_client_secret
                    ? "Refresh requires refresh_token + client_id + client_secret"
                    : "Manually mint a new access token using the saved refresh token"
                }
              >
                <RefreshCw className="h-4 w-4" />
                {refreshing ? "Refreshing..." : "Refresh Token"}
              </Button>
            </div>

            {lastTest && (
              <div
                className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: lastTest.ok ? PRIMARY : "#B33A3A",
                  color: lastTest.ok ? PRIMARY : "#B33A3A",
                  backgroundColor: lastTest.ok ? "#F1F6EC" : "#FBEDED",
                }}
              >
                {lastTest.ok
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span className="break-words">{lastTest.message}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalShell>
  );
}
