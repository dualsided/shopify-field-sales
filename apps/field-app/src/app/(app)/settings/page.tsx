'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  tenant: {
    name: string;
    domain: string;
  };
  territories: string[];
  stats: {
    assignedCompanies: number;
    totalOrders: number;
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/profile');
        const data = await res.json();

        if (data.data) {
          setProfile(data.data);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      // Handle error
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setPasswordError(data.error.message);
      } else {
        setPasswordSuccess(true);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => {
          setShowPasswordForm(false);
          setPasswordSuccess(false);
        }, 2000);
      }
    } catch (error) {
      setPasswordError('Failed to update password');
      console.error('Error updating password:', error);
    } finally {
      setSubmitting(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(dateString));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Profile */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Profile</h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : profile ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-2xl font-semibold text-primary-600">
                  {profile.firstName[0]}{profile.lastName[0]}
                </span>
              </div>
              <div>
                <p className="font-semibold text-lg text-gray-900">
                  {profile.firstName} {profile.lastName}
                </p>
                <p className="text-sm text-gray-500">{profile.email}</p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Role</span>
                <span className="text-sm font-medium capitalize">{profile.role.toLowerCase()}</span>
              </div>
              {profile.phone && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Phone</span>
                  <span className="text-sm font-medium">{profile.phone}</span>
                </div>
              )}
              {profile.territories.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Territories</span>
                  <span className="text-sm font-medium">{profile.territories.join(', ')}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Member since</span>
                <span className="text-sm font-medium">{formatDate(profile.createdAt)}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{profile.stats.assignedCompanies}</p>
                <p className="text-xs text-gray-500">Assigned Accounts</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{profile.stats.totalOrders}</p>
                <p className="text-xs text-gray-500">Total Orders</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Could not load profile</p>
        )}
      </div>

      {/* Security */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">Security</h2>
        {!showPasswordForm ? (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="text-primary-600 text-sm font-medium"
          >
            Change Password
          </button>
        ) : (
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Current Password</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">New Password</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="input"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="input"
                required
              />
            </div>

            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="text-sm text-green-600">Password updated successfully!</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(false);
                  setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  setPasswordError(null);
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary flex-1"
              >
                {submitting ? 'Saving...' : 'Update'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Store Info */}
      {profile?.tenant && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Store</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Name</span>
              <span className="font-medium">{profile.tenant.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Domain</span>
              <span className="font-medium text-xs font-mono">{profile.tenant.domain}</span>
            </div>
          </div>
        </div>
      )}

      {/* App Info */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">App Info</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Version</span>
            <span>0.1.0</span>
          </div>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full py-3 text-red-600 font-medium rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
