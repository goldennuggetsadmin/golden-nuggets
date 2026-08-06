import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, AlertTriangle, ShieldCheck, KeyRound, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";

function evaluatePasswordStrength(password) {
  if (!password) return { score: 0, label: "", color: "bg-surface-2", textColor: "text-muted-foreground" };
  
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) score += 1;

  if (score <= 2) return { score, label: "Weak", color: "bg-destructive", textColor: "text-destructive" };
  if (score <= 3) return { score, label: "Fair", color: "bg-amber-500", textColor: "text-amber-500" };
  if (score <= 4) return { score, label: "Good", color: "bg-yellow-400", textColor: "text-yellow-400" };
  if (score <= 5) return { score, label: "Strong", color: "bg-emerald-500", textColor: "text-emerald-500" };
  return { score, label: "Very Strong", color: "bg-gold", textColor: "text-gold" };
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [validating, setValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenError, setTokenError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState("");

  const strength = useMemo(() => evaluatePasswordStrength(newPassword), [newPassword]);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setIsValidToken(false);
      setTokenError("No reset token provided.");
      return;
    }

    (async () => {
      try {
        const { data } = await api.get(`/auth/validate-reset-token?token=${encodeURIComponent(token)}`);
        if (data && data.valid) {
          setIsValidToken(true);
        } else {
          setIsValidToken(false);
          setTokenError(data.message || "This password reset link is invalid or has expired.");
        }
      } catch (err) {
        setIsValidToken(false);
        setTokenError("This password reset link is invalid or has expired.");
      } finally {
        setValidating(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (newPassword.length < 12) {
      setFormError("Password must be at least 12 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }
    if (strength.score < 4) {
      setFormError("Please choose a stronger password containing uppercase, lowercase, numbers, and special characters.");
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post("/auth/reset-password", {
        token,
        new_password: newPassword,
      });
      if (data?.ok) {
        setSuccess(true);
      } else {
        setFormError(data?.detail || "Failed to reset password. Please try again.");
      }
    } catch (err) {
      setFormError(err.response?.data?.detail || "This password reset link is invalid or has expired.");
    } finally {
      setBusy(false);
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
              Administration
            </div>
          </div>
        </div>

        {validating ? (
          <div className="rounded-2xl border hairline bg-card p-8 text-center space-y-3">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Validating reset token…</p>
          </div>
        ) : !isValidToken ? (
          <div className="rounded-2xl border hairline bg-card p-8 text-center space-y-4 shadow-glow">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="font-serif text-xl text-foreground">Invalid Reset Link</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {tokenError || "This password reset link is invalid or has expired."}
            </p>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Sign In
              </Link>
            </div>
          </div>
        ) : success ? (
          <div className="rounded-2xl border hairline bg-card p-8 text-center space-y-4 shadow-glow">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="font-serif text-2xl text-foreground">Password Reset Complete</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your administrator password has been updated. All active sessions have been invalidated.
            </p>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-glow hover:opacity-95"
              >
                Sign In with New Password
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border hairline bg-card p-6 lg:p-8 shadow-glow">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Security</p>
              <h1 className="mt-2 font-serif text-2xl text-foreground">Reset Password</h1>
              <p className="mt-1 text-sm text-muted-foreground">Enter a new secure password for your admin account.</p>
            </div>

            <label className="block">
              <div className="mb-1.5 text-[13px] text-foreground font-medium">New Password</div>
              <div className="relative">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 12 characters"
                  required
                  autoFocus
                  className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <KeyRound className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              </div>
            </label>

            {/* Password Strength Indicator */}
            {newPassword && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Strength</span>
                  <span className={`font-semibold ${strength.textColor}`}>{strength.label}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color}`}
                    style={{ width: `${(strength.score / 6) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <label className="block">
              <div className="mb-1.5 text-[13px] text-foreground font-medium">Confirm Password</div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                className="h-11 w-full rounded-lg border hairline bg-background/40 px-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>

            {/* Requirements Checklist */}
            <div className="rounded-xl border hairline bg-background/30 p-3 space-y-1.5 text-[12px] text-muted-foreground">
              <div className="font-semibold text-foreground flex items-center gap-1.5 mb-1">
                <ShieldCheck className="h-3.5 w-3.5 text-gold" /> Password Policy:
              </div>
              <div className={newPassword.length >= 12 ? "text-emerald-400" : ""}>• At least 12 characters</div>
              <div className={/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) ? "text-emerald-400" : ""}>• Uppercase & lowercase letters</div>
              <div className={/\d/.test(newPassword) ? "text-emerald-400" : ""}>• At least one number</div>
              <div className={/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword) ? "text-emerald-400" : ""}>• At least one special character</div>
            </div>

            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-foreground">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !newPassword || !confirmPassword}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating Password…
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
