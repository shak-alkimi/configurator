import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  // We render our own /login page now (src/pages/Login.jsx), so the SDK
  // should NOT auto-redirect to Base44's hosted login on 401. AuthContext
  // catches the auth_required error and App.jsx routes to /login itself.
  requiresAuth: false,
  appBaseUrl
});
