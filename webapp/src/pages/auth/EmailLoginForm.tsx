/**
 * Email + password login form. Secondary auth method; phone OTP is the primary flow.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { roleHomePath } from '@/router/paths';
import { signInWithEmail, sendResetEmail, translateAuthError } from '@/services/authService';
import { toast } from 'sonner';

export function EmailLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (profile) {
      navigate(roleHomePath(profile.role), { replace: true });
    }
  }, [profile, navigate]);

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setBusy(true);
    try {
      await signInWithEmail(email.trim(), password);
      toast.success('Signed in successfully');
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  }, [email, password]);

  const handleForgot = useCallback(async () => {
    if (!email.trim()) {
      setError('Enter your email first, then click Forgot Password.');
      return;
    }
    try {
      await sendResetEmail(email.trim());
      toast.success('Password reset email sent. Check your inbox.');
    } catch (err) {
      setError(translateAuthError(err));
    }
  }, [email]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          disabled={busy}
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="label">
            Password
          </label>
          <button
            type="button"
            onClick={handleForgot}
            className="text-xs font-medium text-brand-primary hover:underline"
          >
            Forgot password?
          </button>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          disabled={busy}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
