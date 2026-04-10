/**
 * Phone OTP login form. Two stages:
 *   1. Enter phone number → send OTP
 *   2. Enter 6-digit OTP → verify and sign in
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ConfirmationResult } from 'firebase/auth';
import { useAuth } from '@/hooks/useAuth';
import { roleHomePath } from '@/router/paths';
import {
  sendPhoneOtp,
  confirmOtp,
  translateAuthError,
  clearRecaptchaVerifier,
} from '@/services/authService';
import { normaliseIndianPhone } from '@bba/shared';
import { toast } from 'sonner';

type Stage = 'phone' | 'otp';

export function PhoneLoginForm() {
  const [stage, setStage] = useState<Stage>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Clean up reCAPTCHA when the form unmounts
  useEffect(() => () => clearRecaptchaVerifier(), []);

  // Redirect once auth + profile resolve
  useEffect(() => {
    if (profile) {
      navigate(roleHomePath(profile.role), { replace: true });
    }
  }, [profile, navigate]);

  const handleSendOtp = useCallback(async () => {
    setError('');
    const e164 = normaliseIndianPhone(phoneInput);
    if (!e164) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    setBusy(true);
    try {
      const result = await sendPhoneOtp(e164, 'recaptcha-container');
      setConfirmation(result);
      setStage('otp');
      toast.success('OTP sent to ' + e164);
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  }, [phoneInput]);

  const handleVerifyOtp = useCallback(async () => {
    setError('');
    if (!confirmation) return;
    if (otpInput.length !== 6) {
      setError('Enter the 6-digit code from your SMS.');
      return;
    }

    setBusy(true);
    try {
      await confirmOtp(confirmation, otpInput);
      toast.success('Signed in successfully');
      // Auth state change → AuthContext → profile load → useEffect redirect above
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setBusy(false);
    }
  }, [confirmation, otpInput]);

  if (stage === 'phone') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendOtp();
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="phone" className="label">
            Mobile number
          </label>
          <div className="flex gap-2">
            <span className="flex items-center rounded-lg border border-gray-200 bg-brand-surface px-3 text-sm text-gray-500">
              +91
            </span>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98765 43210"
              maxLength={12}
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              className="input"
              disabled={busy}
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Sending OTP…' : 'Send OTP'}
        </button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleVerifyOtp();
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="otp" className="label">
          Enter OTP
        </label>
        <input
          id="otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          value={otpInput}
          onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
          className="input text-center text-lg tracking-widest"
          disabled={busy}
        />
        <p className="mt-1 text-xs text-gray-500">
          Sent to +91 {phoneInput}
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? 'Verifying…' : 'Verify & Sign In'}
      </button>
      <button
        type="button"
        onClick={() => {
          setStage('phone');
          setOtpInput('');
          setError('');
          setConfirmation(null);
        }}
        className="btn-ghost w-full"
      >
        Change number
      </button>
    </form>
  );
}
