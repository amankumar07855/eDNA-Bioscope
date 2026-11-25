import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Mail, Save } from 'lucide-react';
import WorkspaceLayout from '../components/WorkspaceLayout';
import { useAuth, type UserCategory } from '../context/AuthContext';

export default function ProfilePage() {
  const {
    firebaseUser,
    firestoreProfile,
    serverProfile,
    updateUserProfileData,
    changeUserPassword,
    resendVerificationEmail,
  } = useAuth();

  const [fullName, setFullName] = useState(firestoreProfile?.fullName || serverProfile?.fullName || '');
  const [country, setCountry] = useState(firestoreProfile?.country || serverProfile?.country || '');
  const [institution, setInstitution] = useState(firestoreProfile?.institution || serverProfile?.institution || '');
  const [userCategory, setUserCategory] = useState<UserCategory>(
    (firestoreProfile?.userCategory || serverProfile?.userCategory || 'Researcher') as UserCategory
  );
  const [defaultMarker, setDefaultMarker] = useState(firestoreProfile?.preferences?.defaultMarker || 'COI');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [passMsg, setPassMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const usesPassword = firebaseUser?.providerData.some((p) => p.providerId === 'password');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setErrorMsg(null);
    try {
      await updateUserProfileData({
        fullName,
        country,
        institution,
        userCategory,
        preferences: { defaultMarker, emailNotifications: true },
      });
      setProfileMsg('Profile and Firestore metadata updated successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to update profile');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    setErrorMsg(null);
    try {
      await changeUserPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setPassMsg('Password changed successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to change password');
    }
  };

  return (
    <WorkspaceLayout title="Account & Profile Management" subtitle="Manage your Firebase identity metadata and researcher preferences">
      <div className="max-w-3xl space-y-6">
        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">{errorMsg}</div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Researcher Profile</h2>
              <p className="text-xs font-mono text-slate-500">
                UID: {firebaseUser?.uid} · Email: {firebaseUser?.email}
              </p>
            </div>
            {!firebaseUser?.emailVerified && (
              <button
                type="button"
                onClick={async () => {
                  await resendVerificationEmail();
                  setProfileMsg('Verification email resent.');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg"
              >
                <Mail className="w-3.5 h-3.5" />
                Resend Verification Email
              </button>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Country</label>
                <input
                  required
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Institution</label>
                <input
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">User Category</label>
                <select
                  value={userCategory}
                  onChange={(e) => setUserCategory(e.target.value as UserCategory)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Researcher">Researcher</option>
                  <option value="Student">Student</option>
                  <option value="Environmental Scientist">Environmental Scientist</option>
                  <option value="Conservation Professional">Conservation Professional</option>
                  <option value="Academic Institution">Academic Institution</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Preferred DNA Marker</label>
              <select
                value={defaultMarker}
                onChange={(e) => setDefaultMarker(e.target.value)}
                className="w-full sm:w-48 px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="COI">COI</option>
                <option value="16S">16S</option>
                <option value="12S">12S</option>
                <option value="18S">18S</option>
                <option value="ITS">ITS</option>
                <option value="rbcL">rbcL</option>
              </select>
            </div>

            {profileMsg && (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                <span>{profileMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              <Save className="w-4 h-4" />
              Save Profile
            </button>
          </form>
        </div>

        {usesPassword && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-700" />
              Change Account Password
            </h2>
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">New Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              {passMsg && <p className="text-xs text-emerald-700">{passMsg}</p>}
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                Update Password
              </button>
            </form>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
