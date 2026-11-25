import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { apiFetch } from '../lib/api';

export type UserCategory =
  | 'Researcher'
  | 'Student'
  | 'Environmental Scientist'
  | 'Conservation Professional'
  | 'Academic Institution'
  | 'Other';

export interface FirestoreUserProfile {
  uid: string;
  fullName: string;
  email: string;
  country: string;
  institution?: string;
  userCategory: UserCategory;
  emailVerified: boolean;
  profileImageUrl?: string;
  preferences?: {
    defaultMarker?: string;
    emailNotifications?: boolean;
  };
}

export interface ServerUserProfile {
  uid: string;
  fullName: string;
  email: string;
  country: string;
  institution: string;
  userCategory: string;
  role: 'user' | 'admin';
  accountStatus: 'active' | 'disabled';
  emailVerified: boolean;
  createdAt: string;
}

interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  country: string;
  institution?: string;
  userCategory: UserCategory;
}

interface AuthContextValue {
  firebaseUser: User | null;
  firestoreProfile: FirestoreUserProfile | null;
  serverProfile: ServerUserProfile | null;
  loading: boolean;
  authError: string | null;
  registerWithEmail: (input: RegisterInput) => Promise<void>;
  loginWithEmail: (email: string, password: string, rememberMe: boolean) => Promise<ServerUserProfile>;
  loginWithGoogle: () => Promise<ServerUserProfile>;
  logout: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  reloadVerificationState: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateUserProfileData: (patch: {
    fullName: string;
    country: string;
    institution?: string;
    userCategory: UserCategory;
    preferences?: { defaultMarker?: string; emailNotifications?: boolean };
  }) => Promise<void>;
  changeUserPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshSessionProfile: () => Promise<ServerUserProfile | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firestoreProfile, setFirestoreProfile] = useState<FirestoreUserProfile | null>(null);
  const [serverProfile, setServerProfile] = useState<ServerUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const syncWithBackendAndFirestore = useCallback(
    async (
      user: User,
      registrationHints?: {
        fullName?: string;
        country?: string;
        institution?: string;
        userCategory?: UserCategory;
      }
    ): Promise<ServerUserProfile> => {
      const userDocRef = doc(db, 'users', user.uid);
      let fsProfile: FirestoreUserProfile | null = null;

      try {
        const snap = await getDoc(userDocRef);
        if (!snap.exists()) {
          const newProfile = {
            uid: user.uid,
            fullName: (registrationHints?.fullName || user.displayName || user.email?.split('@')[0] || 'Researcher').slice(0, 120),
            email: user.email || '',
            country: (registrationHints?.country || 'Unspecified').slice(0, 100),
            institution: (registrationHints?.institution || '').slice(0, 160),
            userCategory: registrationHints?.userCategory || 'Researcher',
            emailVerified: Boolean(user.emailVerified),
            preferences: { defaultMarker: 'COI', emailNotifications: true },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(userDocRef, newProfile);
          fsProfile = {
            uid: newProfile.uid,
            fullName: newProfile.fullName,
            email: newProfile.email,
            country: newProfile.country,
            institution: newProfile.institution,
            userCategory: newProfile.userCategory as UserCategory,
            emailVerified: newProfile.emailVerified,
            preferences: newProfile.preferences,
          };
        } else {
          const data = snap.data() as FirestoreUserProfile;
          if (data.emailVerified !== user.emailVerified) {
            await updateDoc(userDocRef, {
              emailVerified: Boolean(user.emailVerified),
              updatedAt: serverTimestamp(),
            });
          }
          fsProfile = { ...data, emailVerified: Boolean(user.emailVerified) };
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }

      setFirestoreProfile(fsProfile);

      // Sync with server using verified Firebase ID token (server controls role & status)
      const syncRes = await apiFetch<{ profile: ServerUserProfile }>('/api/auth/sync', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fsProfile?.fullName ?? registrationHints?.fullName,
          country: fsProfile?.country ?? registrationHints?.country,
          institution: fsProfile?.institution ?? registrationHints?.institution,
          userCategory: fsProfile?.userCategory ?? registrationHints?.userCategory,
        }),
      });
      setServerProfile(syncRes.profile);
      return syncRes.profile;
    },
    []
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);
      if (!user) {
        setFirestoreProfile(null);
        setServerProfile(null);
        setLoading(false);
        return;
      }

      try {
        await syncWithBackendAndFirestore(user);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unable to synchronize user profile');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [syncWithBackendAndFirestore]);

  const registerWithEmail = async (input: RegisterInput): Promise<void> => {
    setAuthError(null);
    const cred = await createUserWithEmailAndPassword(auth, input.email, input.password);
    await updateProfile(cred.user, { displayName: input.fullName });
    await sendEmailVerification(cred.user);
    await syncWithBackendAndFirestore(cred.user, {
      fullName: input.fullName,
      country: input.country,
      institution: input.institution,
      userCategory: input.userCategory,
    });
  };

  const loginWithEmail = async (email: string, password: string, rememberMe: boolean): Promise<ServerUserProfile> => {
    setAuthError(null);
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await cred.user.reload();
    return syncWithBackendAndFirestore(cred.user);
  };

  const loginWithGoogle = async (): Promise<ServerUserProfile> => {
    setAuthError(null);
    await setPersistence(auth, browserLocalPersistence);
    const cred = await signInWithPopup(auth, googleProvider);
    return syncWithBackendAndFirestore(cred.user);
  };

  const logout = async (): Promise<void> => {
    await signOut(auth);
    setFirestoreProfile(null);
    setServerProfile(null);
  };

  const resendVerificationEmail = async (): Promise<void> => {
    if (!auth.currentUser) throw new Error('No authenticated user session');
    await sendEmailVerification(auth.currentUser);
  };

  const reloadVerificationState = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const updatedUser = auth.currentUser;
    setFirebaseUser(updatedUser);
    if (updatedUser.emailVerified) {
      await syncWithBackendAndFirestore(updatedUser);
    }
    return updatedUser.emailVerified;
  };

  const sendPasswordReset = async (email: string): Promise<void> => {
    await sendPasswordResetEmail(auth, email);
  };

  const updateUserProfileData = async (patch: {
    fullName: string;
    country: string;
    institution?: string;
    userCategory: UserCategory;
    preferences?: { defaultMarker?: string; emailNotifications?: boolean };
  }): Promise<void> => {
    if (!auth.currentUser) throw new Error('Not authenticated');
    const uid = auth.currentUser.uid;
    const userRef = doc(db, 'users', uid);

    try {
      await updateDoc(userRef, {
        fullName: patch.fullName.slice(0, 120),
        country: patch.country.slice(0, 100),
        institution: (patch.institution ?? '').slice(0, 160),
        userCategory: patch.userCategory,
        ...(patch.preferences ? { preferences: patch.preferences } : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }

    await updateProfile(auth.currentUser, { displayName: patch.fullName });
    await syncWithBackendAndFirestore(auth.currentUser, patch);
  };

  const changeUserPassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('No email/password session active');
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPassword);
  };

  const refreshSessionProfile = async (): Promise<ServerUserProfile | null> => {
    if (!auth.currentUser) return null;
    return syncWithBackendAndFirestore(auth.currentUser);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        firestoreProfile,
        serverProfile,
        loading,
        authError,
        registerWithEmail,
        loginWithEmail,
        loginWithGoogle,
        logout,
        resendVerificationEmail,
        reloadVerificationState,
        sendPasswordReset,
        updateUserProfileData,
        changeUserPassword,
        refreshSessionProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
