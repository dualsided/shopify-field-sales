'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type LoginStep = 'phone' | 'otp';

interface SalesRep {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  shopName: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Dev mode state
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [selectedRepId, setSelectedRepId] = useState('');
  const [isLoadingReps, setIsLoadingReps] = useState(false);

  const isDev = process.env.NODE_ENV === 'development';

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Load dev reps when dev login is shown
  useEffect(() => {
    if (showDevLogin && reps.length === 0) {
      fetchDevReps();
    }
  }, [showDevLogin]);

  async function fetchDevReps() {
    setIsLoadingReps(true);
    try {
      const response = await fetch('/api/auth/dev/reps');
      const data = await response.json();
      if (data.data) {
        setReps(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch reps:', err);
    } finally {
      setIsLoadingReps(false);
    }
  }

  /**
   * Normalize phone number to digits only
   * Strips all non-digit characters
   */
  function normalizePhone(value: string): string {
    return value.replace(/\D/g, '');
  }

  /**
   * Format phone for display using right-to-left parsing:
   * - Last 4 digits: XXXX (subscriber number)
   * - Previous 3 digits: XXX (exchange)
   * - Previous 3 digits: (XXX) (area code)
   * - Remaining digits: country code
   *
   * Result: CC (XXX) XXX-XXXX
   *
   * Examples:
   * - 17605791793 → 1 (760) 579-1793
   * - 447700900000 → 44 (770) 090-0000
   */
  function formatPhoneDisplay(value: string): string {
    const digits = normalizePhone(value);
    const len = digits.length;

    if (len === 0) return '';

    // Build from right to left
    // We need at least 10 digits for a complete phone (area + local)
    // Country code can be 1-3 digits

    if (len <= 3) {
      // Just country code so far
      return digits;
    }

    if (len <= 6) {
      // Country code + partial area code
      const countryCode = digits.slice(0, len - 3);
      const areaCode = digits.slice(-3);
      return `${countryCode} (${areaCode}`;
    }

    if (len <= 9) {
      // Country code + area code + partial exchange
      const countryCode = digits.slice(0, len - 6);
      const areaCode = digits.slice(len - 6, len - 3);
      const exchange = digits.slice(-3);
      if (countryCode) {
        return `${countryCode} (${areaCode}) ${exchange}`;
      }
      return `(${areaCode}) ${exchange}`;
    }

    // Full number: country code + area code + exchange + subscriber
    const subscriberStart = len - 4;
    const exchangeStart = len - 7;
    const areaStart = len - 10;

    const subscriber = digits.slice(subscriberStart);
    const exchange = digits.slice(exchangeStart, subscriberStart);
    const areaCode = digits.slice(areaStart, exchangeStart);
    const countryCode = areaStart > 0 ? digits.slice(0, areaStart) : '';

    if (countryCode) {
      return `${countryCode} (${areaCode}) ${exchange}-${subscriber}`;
    }
    return `(${areaCode}) ${exchange}-${subscriber}`;
  }

  /**
   * Check if phone number is valid
   * Must have at least 10 digits (area code + 7-digit local)
   * With country code, typically 11+ digits
   */
  function isValidPhone(value: string): boolean {
    const digits = normalizePhone(value);
    // Minimum: 10 digits (US without country code) or 11+ with country code
    return digits.length >= 10;
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatPhoneDisplay(e.target.value);
    setPhone(formatted);
    setError('');
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const digits = normalizePhone(phone);

    if (!isValidPhone(phone)) {
      setError('Please enter a valid phone number with country and area code');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+${digits}` }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Failed to send verification code');
        return;
      }

      setStep('otp');
      setCountdown(60);
      // Focus first OTP input
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (value && index === 5) {
      const fullOtp = newOtp.join('');
      if (fullOtp.length === 6) {
        handleVerifyOtp(fullOtp);
      }
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    // Handle backspace
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      const newOtp = pastedData.split('');
      setOtp(newOtp);
      handleVerifyOtp(pastedData);
    }
  }

  async function handleVerifyOtp(code?: string) {
    const otpCode = code || otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const digits = normalizePhone(phone);
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+${digits}`, code: otpCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Invalid verification code');
        setOtp(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendOtp() {
    if (countdown > 0) return;

    setError('');
    setIsSubmitting(true);

    try {
      const digits = normalizePhone(phone);
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+${digits}` }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Failed to resend code');
        return;
      }

      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRepId) {
      setError('Please select a sales rep');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/dev/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repId: selectedRepId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Login failed');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <h1 className="text-center text-2xl font-bold text-gray-900">
          Field Sales Manager
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Sign in to your account
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-sm">
        {/* Phone/OTP Login */}
        {!showDevLogin && (
          <>
            {step === 'phone' ? (
              <form onSubmit={handleSendOtp} className="space-y-6">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                    Phone Number
                  </label>
                  <div className="mt-2">
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="1 (555) 123-4567"
                      className="input"
                      autoComplete="tel"
                      autoFocus
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    We'll send you a verification code
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !isValidPhone(phone)}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Sending...' : 'Send Code'}
                </button>
              </form>
            ) : (
              <div className="space-y-6">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div className="text-center">
                  <p className="text-sm text-gray-600">
                    Enter the 6-digit code sent to
                  </p>
                  <p className="font-medium text-gray-900">{phone}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('phone');
                      setOtp(['', '', '', '', '', '']);
                      setError('');
                    }}
                    className="text-sm text-primary-600 hover:text-primary-700 mt-1"
                  >
                    Change number
                  </button>
                </div>

                <div className="flex justify-center gap-2">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {otpRefs.current[index] = el}}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      className="w-12 h-14 text-center text-xl font-semibold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleVerifyOtp()}
                  disabled={isSubmitting || otp.join('').length !== 6}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Verifying...' : 'Verify'}
                </button>

                <div className="text-center">
                  {countdown > 0 ? (
                    <p className="text-sm text-gray-500">
                      Resend code in {countdown}s
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isSubmitting}
                      className="text-sm text-primary-600 hover:text-primary-700"
                    >
                      Resend code
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Dev Login */}
        {showDevLogin && (
          <form onSubmit={handleDevLogin} className="space-y-6">
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 font-medium text-center">
                Development Mode
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="rep" className="block text-sm font-medium text-gray-700">
                Select Sales Rep
              </label>
              {isLoadingReps ? (
                <div className="mt-2 p-3 bg-gray-100 rounded-lg text-center text-sm text-gray-500">
                  Loading sales reps...
                </div>
              ) : reps.length === 0 ? (
                <div className="mt-2 p-3 bg-gray-100 rounded-lg text-center text-sm text-gray-500">
                  No sales reps found. Run database seed first.
                </div>
              ) : (
                <select
                  id="rep"
                  value={selectedRepId}
                  onChange={(e) => setSelectedRepId(e.target.value)}
                  className="input mt-2"
                >
                  <option value="">Choose a rep...</option>
                  {reps.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      {rep.firstName} {rep.lastName} ({rep.role}) - {rep.shopName}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isLoadingReps || reps.length === 0}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in as Rep'}
            </button>
          </form>
        )}

        {/* Toggle dev login (only in development) */}
        {isDev && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setShowDevLogin(!showDevLogin);
                setError('');
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {showDevLogin ? 'Use phone login' : 'Use dev login'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
