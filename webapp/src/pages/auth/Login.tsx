/**
 * Login page — email + password authentication.
 *
 * After successful auth, the AuthContext bootstraps the /users/{uid} doc and the
 * router redirects the user to their role-appropriate home page.
 */

import { useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/common/Logo';
import { roleHomePath } from '@/router/paths';
import { EmailLoginForm } from './EmailLoginForm';

export default function LoginPage() {
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
            BBA Sports Academy
          </h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>

        <EmailLoginForm />

        <p className="mt-6 text-center text-sm text-gray-500">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium text-brand-primary hover:underline">
            Sign up
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-gray-400">
          Admin whose role was reset?{' '}
          <Link to="/setup" className="font-medium text-brand-primary hover:underline">
            Restore access →
          </Link>
        </p>
      </div>
    </div>
  );
}
