import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { EcoDnaLogo } from '../components/EcoDnaLogo';
import { useAuth, type UserCategory } from '../context/AuthContext';

const registerSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters').max(120),
    email: z.string().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[a-z]/, 'Include at least one lowercase letter')
      .regex(/[0-9]/, 'Include at least one number')
      .regex(/[^A-Za-z0-9]/, 'Include at least one special character'),
    confirmPassword: z.string(),
    country: z.string().min(2, 'Please specify your country').max(100),
    institution: z.string().max(160).optional(),
    userCategory: z.enum([
      'Researcher',
      'Student',
      'Environmental Scientist',
      'Conservation Professional',
      'Academic Institution',
      'Other',
    ]),
    agreeTerms: z.boolean().refine((v) => v === true, {
      message: 'You must agree to the Terms and Conditions',
    }),
    agreePrivacy: z.boolean().refine((v) => v === true, {
      message: 'You must agree to the Privacy Policy',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

function getFirebaseErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('auth/email-already-in-use')) {
    return 'An account with this email address already exists. Please sign in instead.';
  }
  if (msg.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication > Sign-in method). You can enable it there or use Continue with Google.';
  }
  if (msg.includes('auth/popup-closed-by-user')) {
    return 'Google sign-in popup was closed before completing authentication.';
  }
  if (msg.includes('auth/network-request-failed')) {
    return 'Network error occurred while contacting Firebase Authentication.';
  }
  return msg;
}

export default function RegisterPage() {
  const { registerWithEmail, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      userCategory: 'Researcher',
    },
  });

  const passwordVal = watch('password') || '';
  const strength = useMemo(() => {
    let score = 0;
    if (passwordVal.length >= 8) score++;
    if (/[A-Z]/.test(passwordVal) && /[a-z]/.test(passwordVal)) score++;
    if (/[0-9]/.test(passwordVal)) score++;
    if (/[^A-Za-z0-9]/.test(passwordVal)) score++;
    if (passwordVal.length >= 12) score++;
    const label = score <= 1 ? 'Weak' : score <= 3 ? 'Moderate' : 'Strong';
    return { score, label };
  }, [passwordVal]);

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    try {
      await registerWithEmail({
        fullName: data.fullName,
        email: data.email,
        password: data.password,
        country: data.country,
        institution: data.institution,
        userCategory: data.userCategory as UserCategory,
      });
      navigate('/verify-email');
    } catch (err) {
      setServerError(getFirebaseErrorMessage(err));
    }
  };

  const handleGoogleSignIn = async () => {
    setServerError(null);
    setGoogleLoading(true);
    try {
      const profile = await loginWithGoogle();
      navigate(profile.role === 'admin' ? '/dashboard' : '/dashboard');
    } catch (err) {
      setServerError(getFirebaseErrorMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/">
            <EcoDnaLogo />
          </Link>
          <Link to="/login" className="text-sm font-medium text-emerald-700 hover:underline">
            Already have an account? Sign in
          </Link>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">Create Researcher Account</h1>
            <p className="mt-1 text-sm text-slate-600">
              Register to manage environmental DNA projects, upload datasets, and compute biodiversity analytics.
            </p>
          </div>

          {serverError && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-sm text-rose-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full py-2.5 px-4 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold rounded-lg flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60"
          >
            {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
                <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200" />
            <span className="mx-3 text-xs text-slate-400">or register with email</span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  {...register('fullName')}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder="Dr. Aarav Sharma"
                />
                {errors.fullName && <p className="mt-1 text-xs text-rose-600">{errors.fullName.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  {...register('email')}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder="aarav@institute.org"
                />
                {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password *</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    {...register('password')}
                    className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="Min 8 chars, mixed case & symbol"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                    aria-label="Toggle password visibility"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordVal && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div
                          key={n}
                          className={`flex-1 ${
                            n <= strength.score
                              ? strength.score <= 1
                                ? 'bg-rose-500'
                                : strength.score <= 3
                                ? 'bg-amber-500'
                                : 'bg-emerald-600'
                              : 'bg-transparent'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] font-mono text-slate-600">{strength.label}</span>
                  </div>
                )}
                {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Confirm Password *</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    {...register('confirmPassword')}
                    className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="Re-enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                    aria-label="Toggle confirm password visibility"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <p className="mt-1 text-xs text-rose-600">{errors.confirmPassword.message}</p>}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Country *</label>
                <input
                  type="text"
                  {...register('country')}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  placeholder="India"
                />
                {errors.country && <p className="mt-1 text-xs text-rose-600">{errors.country.message}</p>}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">User Category *</label>
                <select
                  {...register('userCategory')}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="Researcher">Researcher</option>
                  <option value="Student">Student</option>
                  <option value="Environmental Scientist">Environmental Scientist</option>
                  <option value="Conservation Professional">Conservation Professional</option>
                  <option value="Academic Institution">Academic Institution</option>
                  <option value="Other">Other</option>
                </select>
                {errors.userCategory && <p className="mt-1 text-xs text-rose-600">{errors.userCategory.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Institution or College (Optional)</label>
              <input
                type="text"
                {...register('institution')}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                placeholder="National Centre for Biological Sciences"
              />
            </div>

            <div className="space-y-2 pt-2">
              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" {...register('agreeTerms')} className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" />
                <span>I agree to the EcoDNA AI Terms and Conditions for scientific data handling.</span>
              </label>
              {errors.agreeTerms && <p className="text-xs text-rose-600">{errors.agreeTerms.message}</p>}

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" {...register('agreePrivacy')} className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600" />
                <span>I agree to the Privacy Policy governing Firebase authentication and private dataset isolation.</span>
              </label>
              {errors.agreePrivacy && <p className="text-xs text-rose-600">{errors.agreePrivacy.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Creating Account...' : 'Register with Email'}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>All public registrations receive standard researcher permissions with isolated project storage.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
