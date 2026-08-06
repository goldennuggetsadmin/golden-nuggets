import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, KeyRound, CheckCircle2, X } from "lucide-react";
import { api } from "@/lib/api";

export default function Login() {
  const { user, login, error } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Forgot Password Modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState("");

  if (user && user !== false) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    try {
      await login(password);
    } finally {
      setBusy(false);
    }
  };

  const handleSendResetLink = async () => {
    setForgotBusy(true);
    setForgotError("");
    try {
      await api.post("/auth/forgot-password");
      setForgotSuccess(true);
    } catch (err) {
      setForgotError(err.response?.data?.detail || "Unable to send password reset request. Please try again.");
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div className="dark grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md">
        {/* Brand Header */}
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

        {/* Single-Password Login Form */}
        <form
          data-testid="login-form"
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border hairline bg-card p-6 lg:p-8 shadow-glow"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Sign in</p>
            <h1 className="mt-2 font-serif text-2xl text-foreground">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">Administrator access only.</p>
          </div>

          <label className="block">
            <div className="mb-1.5 text-[13px] text-foreground font-medium">Password</div>
            <div className="relative">
              <input
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                required
                autoFocus
                className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <KeyRound className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            </div>
          </label>

          {error && (
            <div data-testid="login-error" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-foreground">
              {String(error)}
            </div>
          )}

          <button
            data-testid="login-submit-btn"
            type="submit"
            disabled={busy || !password}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-95 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting…
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => {
                setShowForgotModal(true);
                setForgotSuccess(false);
                setForgotError("");
              }}
              className="text-xs text-muted-foreground hover:text-primary transition hover:underline"
            >
              Forgot Password?
            </button>
          </div>
        </form>
      </div>

      {/* Forgot Password Confirmation Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border hairline bg-card p-6 shadow-glow">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl text-foreground">Reset Password</h2>
              <button
                onClick={() => setShowForgotModal(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!forgotSuccess ? (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  A secure password reset link will be sent to the official administrator email address:
                </p>

                <div className="rounded-xl border hairline bg-background/50 p-3 text-center text-sm font-medium text-primary font-mono">
                  goldennuggets.admin@gmail.com
                </div>

                {forgotError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                    {forgotError}
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="rounded-full border hairline bg-surface-2/40 px-4 py-2 text-sm text-foreground hover:bg-surface-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={forgotBusy}
                    onClick={handleSendResetLink}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-glow disabled:opacity-70"
                  >
                    {forgotBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      "Send Reset Link"
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="font-serif text-lg text-foreground">Password Reset Email Sent</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Please check your inbox at:<br />
                  <strong className="text-foreground font-mono">goldennuggets.admin@gmail.com</strong>
                </p>
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-glow"
                  >
                    Back to Sign In
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
