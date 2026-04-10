/**
 * Registration page — email/password signup only (phone OTP doesn't need a separate
 * register flow; the first successful OTP verify automatically creates the account).
 *
 * After registration the AuthContext bootstraps the /users/{uid} doc and the user is
 * redirected to their role home (default: student dashboard).
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { roleHomePath } from '@/router/paths';
import { registerWithEmail, translateAuthError } from '@/services/authService';
import { Logo } from '@/components/common/Logo';
import { toast } from 'sonner';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && profile) {
      navigate(roleHomePath(profile.role), { replace: true });
    }
  }, [isAuthenticated, profile, navigate]);

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      await registerWithEmail(email.trim(), password, name.trim());
      toast.success('Account created!');
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  }, [name, email, password]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Logo size="lg" />
          <h1 className="mt-4 text-2xl font-bold text-brand-secondary">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Join Believers Badminton Academy</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="name" className="label">Full name</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Ravi Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="reg-email" className="label">Email</label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              placeholder="ravi@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="reg-password" className="label">Password</label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              disabled={busy}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
