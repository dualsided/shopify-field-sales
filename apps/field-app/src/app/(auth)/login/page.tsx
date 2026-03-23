'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [selectedRepId, setSelectedRepId] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchReps() {
      try {
        const response = await fetch('/api/auth/dev/reps');
        const data = await response.json();
        if (data.data) {
          setReps(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch reps:', err);
        setError('Failed to load sales reps');
      } finally {
        setIsLoading(false);
      }
    }
    fetchReps();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
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
          Development Mode
        </p>
        <div className="mt-2 mx-auto w-fit px-3 py-1 bg-yellow-100 border border-yellow-300 rounded-full">
          <p className="text-xs text-yellow-800 font-medium">DEV ONLY</p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="rep" className="block text-sm font-medium text-gray-700">
              Select Sales Rep
            </label>
            {isLoading ? (
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
            disabled={isSubmitting || isLoading || reps.length === 0}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in as Rep'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          This dev login bypasses authentication.<br />
          Production will use phone + Twilio SMS verification.
        </p>
      </div>
    </div>
  );
}
