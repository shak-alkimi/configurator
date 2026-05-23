import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, KeyRound, PlugZap, CheckCircle2, XCircle } from "lucide-react";
import PortalShell from "@/components/PortalShell";

// Brand tokens (see Alkimi Brand Guidelines / memory:alkimi-brand-tokens):
//   #252320 near-black, #C0BBB3 warm taupe, #DDDCDA light gray,
//   #EAEAE7 lightest gray, #35790B green accent.
// We use inline style for hex values to avoid introducing one-off Tailwind
// arbitrary-value classes scattered through the file.
const INK = "#252320";
const MUTED = "#7A736B";          // derived neutral used only for help text
const SURFACE_BORDER = "#DDDCDA";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState(null); // { ok, message }
  const [configId, setConfigId] = useState(null);
  const [fields, setFields] = useState({
    access_token: "",
    refresh_token: "",
    client_id: "",
    client_secret: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (cancelled) return;
        setUser(me);
        if (me?.role === "admin") {
          const configs = await base44.entities.IntegrationConfig.filter({ service: "SOS" });
          if (cancelled) return;
          if (configs && configs.length > 0) {
            const c = configs[0];
            setConfigId(c.id);
            setFields({
              access_token: c.access_token || "",
              refresh_token: c.refresh_token || "",
              client_id: c.client_id || "",
              client_secret: c.client_secret || "",
            });
          }
        }
      } catch (err) {
        toast.error(`Failed to load settings: ${err.message || err}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setLastTest(null); // saved creds invalidate the previous test result
    try {
      const data = { service: "SOS", ...fields };
      if (configId) {
        await base44.entities.IntegrationConfig.update(configId, data);
      } else {
        const created = await base44.entities.IntegrationConfig.create(data);
        setConfigId(created.id);
      }
      toast.success("SOS credentials saved");
    } catch (err) {
      toast.error(`Save failed: ${err.message || err}`);
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

  return (
    <PortalShell>
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" style={{ color: MUTED }} />
            <div>
              <CardTitle className="text-base" style={{ color: INK }}>SOS Inventory</CardTitle>
              <CardDescription className="text-xs mt-0.5" style={{ color: MUTED }}>
                OAuth credentials for the SOS Inventory API integration.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="access_token">Access Token</Label>
            <Input
              id="access_token"
              type="password"
              value={fields.access_token}
              onChange={(e) => setFields({ ...fields, access_token: e.target.value })}
              placeholder="Bearer access token"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refresh_token">Refresh Token</Label>
            <Input
              id="refresh_token"
              type="password"
              value={fields.refresh_token}
              onChange={(e) => setFields({ ...fields, refresh_token: e.target.value })}
              placeholder="OAuth refresh token"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                value={fields.client_id}
                onChange={(e) => setFields({ ...fields, client_id: e.target.value })}
                placeholder="OAuth client ID"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_secret">Client Secret</Label>
              <Input
                id="client_secret"
                type="password"
                value={fields.client_secret}
                onChange={(e) => setFields({ ...fields, client_secret: e.target.value })}
                placeholder="OAuth client secret"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 gap-2"
              style={{ backgroundColor: INK, color: "#FFFFFF" }}
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving…" : "Save Credentials"}
            </Button>
            <Button
              onClick={handleTest}
              disabled={testing || !configId}
              variant="outline"
              className="flex-1 gap-2"
              title={!configId ? "Save credentials first" : "Ping SOS to verify the saved credentials"}
            >
              <PlugZap className="h-4 w-4" />
              {testing ? "Testing…" : "Test Connection"}
            </Button>
          </div>

          {lastTest && (
            <div
              className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: lastTest.ok ? "#35790B" : "#B33A3A",
                color: lastTest.ok ? "#35790B" : "#B33A3A",
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
