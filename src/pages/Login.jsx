import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { user, login, error } = useAuth();
  const [email, setEmail] = useState("admin@goldennuggets.com");
  const [password, setPassword] = useState("Admin@123");
  const [busy, setBusy] = useState(false);

  if (user && user !== false) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    console.log(`[${new Date().toISOString()}] [1] Button clicked`);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) return;
    console.log(`[${new Date().toISOString()}] [2] Validation complete for ${cleanEmail}`);
    setBusy(true);
    try {
      await login(cleanEmail, password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dark grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
            <span className="font-serif text-2xl text-primary">G</span>
          </div>
          <div>
            <div className="font-serif text-xl text-foreground">Golden Nuggets</div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Content Control
            </div>
          </div>
        </div>

        <form
          data-testid="login-form"
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border hairline bg-card p-6 lg:p-8"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Sign in</p>
            <h1 className="mt-2 font-serif text-2xl text-foreground">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Admin access only.</p>
          </div>

          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Email</div>
            <input
              data-testid="login-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground">Password</div>
            <input
              data-testid="login-password-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {error && (
            <div data-testid="login-error" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-foreground">
              <div>{String(error)}</div>
              <button
                type="button"
                onClick={onSubmit}
                className="text-xs underline hover:no-underline font-medium"
              >
                Retry Sign In
              </button>
            </div>
          )}

          <button
            data-testid="login-submit-btn"
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-95 disabled:opacity-70"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting…
              </>
            ) : (
              error ? "Retry Sign In" : "Sign in"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
