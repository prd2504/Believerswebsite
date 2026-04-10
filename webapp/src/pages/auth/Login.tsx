/**
 * Login page — supports two modes:
 *   1. Phone OTP (default, India-first)
 *   2. Email + password
 *
 * After successful auth, the AuthContext bootstraps the /users/{uid} doc and the
 * router redirects the user to their role-appropriate home page.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/common/Logo';
import { roleHomePath } from '@/router/paths';
import { PhoneLoginForm } from './PhoneLoginForm';
import { EmailLoginForm } from './EmailLoginForm';

type AuthMode = 'phone' | 'email';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('phone');
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // If already logged in, redirect away from login
  useEffect(() => {
    if (isAuthenticated && profile) {
      const from = (location.state as { from?: string })?.from;
      navigate(from ?? roleHomePath(profile.role), { replace: true });
    }
  }, [isAuthenticated, profile, navigate, location.state]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-background px-4 py-10">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="mb-8 flex flex-col items-center">
          <Logo size="lg" />
          <h1 className="mt-4 text-2xl font-bold text-brand-secondary">
            Believers Badminton Academy
          </h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        {/* Mode toggle */}
        <div className="mb-6 flex rounded-lg border border-gray-200 bg-brand-surface p-1">
          <button
            type="button"
            onClick={() => setMode('phone')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'phone'
                ? 'bg-white text-brand-secondary shadow-sm'
                : 'text-gray-500 hover:text-brand-secondary'
            }`}
          >
            Phone OTP
          </button>
          <button
            type="button"
            onClick={() => setMode('email')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'email'
                ? 'bg-white text-brand-secondary shadow-sm'
                : 'text-gray-500 hover:text-brand-secondary'
            }`}
          >
            Email
          </button>
        </div>

        {/* Forms */}
        {mode === 'phone' ? <PhoneLoginForm /> : <EmailLoginForm />}

        {/* Register link */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-brand-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>

      {/* Invisible reCAPTCHA container — required by Firebase phone auth */}
      <div id="recaptcha-container" />
    </div>
  );
}
