import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, KeyRound } from "lucide-react";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState(null);
  const [fields, setFields] = useState({
    access_token: '',
    refresh_token: '',
    client_id: '',
    client_secret: ''
  });

  useEffect(() => {
    const init = async () => {
      const me = await base44.auth.me();
      setUser(me);
      if (me?.role === 'admin') {
        const configs = await base44.entities.IntegrationConfig.filter({ service: 'SOS' });
        if (configs && configs.length > 0) {
          const c = configs[0];
          setConfigId(c.id);
          setFields({
            access_token: c.access_token || '',
            refresh_token: c.refresh_token || '',
            client_id: c.client_id || '',
            client_secret: c.client_secret || ''
          });
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const data = { service: 'SOS', ...fields };
    if (configId) {
      await base44.entities.IntegrationConfig.update(configId, data);
    } else {
      const created = await base44.entities.IntegrationConfig.create(data);
      setConfigId(created.id);
    }
    setSaving(false);
    toast.success('SOS credentials saved');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
        Access restricted to administrators.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage integrations and credentials.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-slate-500" />
            <div>
              <CardTitle className="text-base">SOS Inventory</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                OAuth credentials for SOS Inventory API integration.
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
              onChange={e => setFields({ ...fields, access_token: e.target.value })}
              placeholder="Bearer access token"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refresh_token">Refresh Token</Label>
            <Input
              id="refresh_token"
              type="password"
              value={fields.refresh_token}
              onChange={e => setFields({ ...fields, refresh_token: e.target.value })}
              placeholder="OAuth refresh token"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="client_id">Client ID</Label>
              <Input
                id="client_id"
                value={fields.client_id}
                onChange={e => setFields({ ...fields, client_id: e.target.value })}
                placeholder="OAuth client ID"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_secret">Client Secret</Label>
              <Input
                id="client_secret"
                type="password"
                value={fields.client_secret}
                onChange={e => setFields({ ...fields, client_secret: e.target.value })}
                placeholder="OAuth client secret"
              />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save Credentials'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}