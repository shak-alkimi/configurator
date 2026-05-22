import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";

/**
 * Brand-aligned rep portal sign-in. Replaces Base44's hosted login page so the
 * sign-in surface matches the rest of the portal (Gellix, brand neutrals,
 * 10px corners). Wraps the SDK's loginViaEmailPassword + loginWithProvider
 * directly — no redirect through base44.app.
 */
export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, checkAppState } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // After successful auth, send the rep back where they came from (or /dashboard).
  const returnTo =
    searchParams.get("from") || searchParams.get("from_url") || "/dashboard";

  // If they're already signed in (page visited directly), skip the form.
  useEffect(() => {
    if (isAuthenticated) navigate(returnTo, { replace: true });
  }, [isAuthenticated, navigate, returnTo]);

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Email and password required");
      return;
    }
    setBusy(true);
    try {
      await base44.auth.loginViaEmailPassword(email.trim(), password);
      await checkAppState?.();
      navigate(returnTo, { replace: true });
    } catch (err) {
      toast.error(err?.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = () => {
    try {
      base44.auth.loginWithProvider("google", returnTo);
    } catch (err) {
      toast.error(err?.message || "Google sign-in unavailable");
    }
  };

  const handleMicrosoft = () => {
    try {
      base44.auth.loginWithProvider("microsoft", returnTo);
    } catch (err) {
      toast.error(err?.message || "Microsoft sign-in unavailable");
    }
  };

  return (
    <div className="min-h-screen bg-secondary flex flex-col items-center justify-center px-[15px] py-12">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center mb-10">
          <img src="/alkimi-logo.svg" alt="Alkimi" className="w-[160px] h-auto" />
        </div>

        <div className="bg-white rounded-[10px] border border-border p-8">
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              className="w-full h-10 gap-2 font-medium"
              data-testid="login-google"
            >
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleMicrosoft}
              className="w-full h-10 gap-2 font-medium"
              data-testid="login-microsoft"
            >
              <MicrosoftIcon className="h-4 w-4" />
              Continue with Outlook
            </Button>
          </div>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-foreground/40">
              or
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email" className="text-xs text-foreground/70">
                Email
              </Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                data-testid="login-email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password" className="text-xs text-foreground/70">
                Password
              </Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="login-password"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full h-10 mt-2 bg-foreground text-background hover:bg-foreground/90"
              data-testid="login-submit"
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="text-xs text-foreground/50 text-center mt-6">
          Need access? Ask an admin to invite you from the Reps page.
        </p>
      </div>
    </div>
  );
}

function MicrosoftIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="2" width="9" height="9" fill="#F25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7FBA00" />
      <rect x="2" y="13" width="9" height="9" fill="#00A4EF" />
      <rect x="13" y="13" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
