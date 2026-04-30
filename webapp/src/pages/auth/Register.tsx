/**
 * Registration page.
 *
 * Regular users (students/parents) register as STUDENT (default).
 * Coaches can register via a separate form — their account starts PENDING_APPROVAL
 * and is activated only after the admin assigns them centres and batches.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { roleHomePath } from '@/router/paths';
import { registerWithEmail, translateAuthError } from '@/services/authService';
import { bootstrapCoachProfile } from '@/services/userService';
import { Logo } from '@/components/common/Logo';
import { toast } from 'sonner';

type RegisterMode = 'student' | 'coach';

export default function RegisterPage() {
  const [mode, setMode] = useState<RegisterMode>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [coachSubmitted, setCoachSubmitted] = useState(false);
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && profile) {
      navigate(roleHomePath(profile.role), { replace: true });
    }
  }, [isAuthenticated, profile, navigate]);

  const handleStudentRegister = useCallback(async () => {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

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

  const handleCoachRegister = useCallback(async () => {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setBusy(true);
    try {
      // Create Firebase Auth user
      const user = await registerWithEmail(email.trim(), password, name.trim());
      // Immediately write coach profile doc so ensureUserProfile finds it and doesn't
      // overwrite with a default STUDENT role
      await bootstrapCoachProfile(user.uid, name.trim(), email.trim(), null);
      // Sign them out — they can't use the app until admin approves
      const { signOut } = await import('@/services/authService');
      await signOut();
      setCoachSubmitted(true);
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  }, [name, email, password]);

  if (coachSubmitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-brand-background px-4 py-10">
        <div className="w-full max-w-sm rounded-xl border border-gray-100 bg-white p-8 shadow-card text-center">
          <Logo size="lg" />
          <h1 className="mt-6 text-lg font-bold text-brand-secondary">Request Submitted!</h1>
          <p className="mt-2 text-sm text-gray-500">
            Your coach account has been created and is awaiting admin approval. You'll be able
            to log in once the admin assigns you to your centre and batches.
          </p>
          <Link to="/login" className="btn-primary mt-6 inline-flex w-full justify-center">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Logo size="lg" />
          <h1 className="mt-4 text-2xl font-bold text-brand-secondary">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Join Believers Badminton Academy</p>
        </div>

        {/* Mode toggle */}
        <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => { setMode('student'); setError(''); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'student' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Student / Parent
          </button>
          <button
            type="button"
            onClick={() => { setMode('coach'); setError(''); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'coach' ? 'bg-white text-brand-secondary shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Coach
          </button>
        </div>

        {mode === 'coach' && (
          <p className="mb-4 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
            Coach accounts require admin approval before you can log in. Once approved,
            you'll have access to attendance and progress for your assigned batches.
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === 'coach') handleCoachRegister();
            else handleStudentRegister();
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
            {busy
              ? 'Creating account…'
              : mode === 'coach'
                ? 'Request Coach Access'
                : 'Sign Up'}
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
