import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  User, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  getDocs 
} from 'firebase/firestore';
import { auth, db, googleProvider, validateFirestoreConnection, handleFirestoreError, OperationType, sanitizeForFirestore } from '../lib/firebase';
import { UserProfile, UserRole, AccountStatus, PatientProfile, DeletedAccountTombstone } from '../types';
import { ensureUserAccountId } from '../utils/medicalId';
import firebaseConfig from '@/firebase-applet-config.json';
import { recordRealMetricEvent } from '../lib/platformMetrics';
import { notifyUserAccountApprovalStatus, notifySuperAdminAccreditationRequest } from '../lib/pushEventDispatcher';
import { clearAllUserSessionCaches, normalizeEmailKey } from '../utils/sessionCleanup';
import { unregisterDevicePush } from '../lib/pushNotificationService';
import { navigateTo } from '../utils/navigation';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  isAdmin: boolean;
  needsOnboarding: boolean;
  unauthorizedDomainDetected: boolean;
  showDomainHelp: boolean;
  setShowDomainHelp: (val: boolean) => void;
  isDemoMode: boolean;
  currentHostname: string;
  firebaseProjectId: string;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, displayName: string, role: UserRole, phone?: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signInAsDemoUser?: (role: UserRole, customName?: string) => Promise<void>;
  exitDemoMode?: () => void;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
  registerAsPatient: (
    displayNameOrPayload?:
      | string
      | {
          displayName: string;
          phone: string;
          gender: 'male' | 'female';
          dateOfBirth: string;
          governorate: string;
          hasMedicalConditions: boolean;
          medicalConditions?: string[];
        },
    phone?: string
  ) => Promise<void>;
  applyForProfessionalRole: (payload: {
    role: UserRole;
    displayName: string;
    licenseNumber: string;
    facilityName: string;
    governorate: string;
    phone: string;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateUserStatusByAdmin: (targetUid: string, newStatus: AccountStatus) => Promise<void>;
  deleteUserByAdmin: (targetUid: string) => Promise<void>;
  deletePendingUsersByAdmin: () => Promise<number>;
  fetchPendingUsersForAdmin: () => Promise<UserProfile[]>;
  deleteOwnAccountPermanently: () => Promise<void>;
}

import { 
  SOLE_SUPER_ADMIN_EMAIL, 
  isVerifiedSuperAdmin, 
  isRevokedAdminEmail, 
  assertSuperAdminAccess, 
  auditAndRevokeUnauthorizedAdmins 
} from '../utils/adminSecurity';

const SUPER_ADMIN_EMAIL = SOLE_SUPER_ADMIN_EMAIL;
const DEMO_STORAGE_KEY = 'm737_demo_role_v1';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [unauthorizedDomainDetected, setUnauthorizedDomainDetected] = useState(false);
  const [showDomainHelp, setShowDomainHelp] = useState(false);
  const isDemoMode = false;
  const lastUidRef = useRef<string | null>(null);
  const profileLoadInFlightRef = useRef<{ uid: string; promise: Promise<void> } | null>(null);

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const firebaseProjectId = firebaseConfig.projectId || 'operating-league-dv9wh';

  // Defer connection validation slightly so first paint on Home is never delayed for guests
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (auth.currentUser) {
        validateFirestoreConnection();
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  const PROFILE_COLLECTIONS = [
    'patient_profiles',
    'doctor_profiles',
    'pharmacy_profiles',
    'lab_profiles',
    'radiology_profiles',
    'wholesaler_profiles',
    'secretary_assignments',
  ] as const;

  const cleanupTargetUserData = async (
    targetUid: string,
    deletedBy: 'self' | 'admin',
    actorUid: string,
    reason: string
  ) => {
    let existingUserData: UserProfile | null = null;
    try {
      const targetUserSnap = await getDoc(doc(db, 'users', targetUid));
      if (targetUserSnap.exists()) {
        existingUserData = targetUserSnap.data() as UserProfile;
      }
    } catch {}

    // Delete account_ids registry mapping if present
    const accountId = existingUserData?.accountId || existingUserData?.medicalId;
    if (accountId) {
      try {
        await deleteDoc(doc(db, 'account_ids', accountId));
      } catch {}
    }

    // Clean up device push tokens subcollection for this user
    try {
      const tokensSnap = await getDocs(collection(db, 'users', targetUid, 'device_tokens'));
      for (const tokenDoc of tokensSnap.docs) {
        await deleteDoc(tokenDoc.ref).catch(() => {});
        await deleteDoc(doc(db, 'device_tokens', tokenDoc.id)).catch(() => {});
      }
    } catch {}

    // Delete role-specific profile documents (clinical records/prescriptions/transactions remain preserved)
    for (const colName of PROFILE_COLLECTIONS) {
      try {
        await deleteDoc(doc(db, colName, targetUid));
      } catch {}
    }

    // Delete admin grant if any
    try {
      await deleteDoc(doc(db, 'admins', targetUid));
    } catch {}

    // Delete primary user document
    await deleteDoc(doc(db, 'users', targetUid));

    // Write tombstone preventing stale Firebase Auth tokens/re-logins from silently reopening deleted account
    const tombstone: DeletedAccountTombstone = {
      uid: targetUid,
      email: normalizeEmailKey(existingUserData?.email || ''),
      previousRole: existingUserData?.role,
      deletedBy,
      deletedByUid: actorUid,
      deletedAt: new Date().toISOString(),
      reason,
    };
    try {
      await setDoc(doc(db, 'deleted_accounts', targetUid), sanitizeForFirestore(tombstone));
    } catch (tombErr) {
      console.warn('Notice writing deleted_accounts tombstone:', tombErr);
    }

    return existingUserData;
  };

  const loadUserProfile = async (firebaseUser: User) => {
    if (profileLoadInFlightRef.current?.uid === firebaseUser.uid) {
      return profileLoadInFlightRef.current.promise;
    }

    const task = (async () => {
    try {
      const isVerifiedSuperAdminEmail = isVerifiedSuperAdmin(firebaseUser);

      // Super Admin access is strictly gated: ONLY verified bcgmoc@gmail.com can be an admin
      setIsAdmin(isVerifiedSuperAdminEmail);

      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists() && !isVerifiedSuperAdminEmail) {
        // Check if this UID was previously deleted by an administrator
        try {
          const tombstoneSnap = await getDoc(doc(db, 'deleted_accounts', firebaseUser.uid));
          if (tombstoneSnap.exists()) {
            const tombstone = tombstoneSnap.data() as DeletedAccountTombstone;
            if (tombstone.deletedBy === 'admin') {
              await clearAllUserSessionCaches();
              await firebaseSignOut(auth);
              setUser(null);
              setUserProfile(null);
              setIsAdmin(false);
              setNeedsOnboarding(false);
              setAuthError(
                'تم حذف هذا الحساب أو إلغاء اعتماده من قبل إدارة المنصة. لا يمكن إعادة فتح الحساب المحذوف تلقائياً.'
              );
              navigateTo('home');
              return;
            }
          }
        } catch (tombErr) {
          console.warn('Deleted account verification notice:', tombErr);
        }
      }

      if (userSnap.exists()) {
        let profile = userSnap.data() as UserProfile;

        // Ensure persistent unique accountId exists in users and account_ids registry
        if (!profile.accountId) {
          try {
            const assignedId = await ensureUserAccountId(
              db,
              firebaseUser.uid,
              profile.role,
              profile.displayName,
              profile.facilityName,
              firebaseUser.email || profile.email,
              profile.phone
            );
            profile.accountId = assignedId;
            if (profile.role === 'patient') {
              profile.medicalId = assignedId;
            }
          } catch (e) {
            console.warn('Notice ensuring user account ID:', e);
          }
        }

        if (isVerifiedSuperAdminEmail) {
          // Authorized Super Admin: elevate/confirm in Firestore
          const now = new Date().toISOString();
          const elevatedProfile: UserProfile = {
            ...profile,
            role: 'super_admin',
            status: 'approved',
            updatedAt: now,
          };
          if (profile.role !== 'super_admin' || profile.status !== 'approved') {
            await setDoc(userDocRef, sanitizeForFirestore(elevatedProfile), { merge: true });
          }
          await setDoc(doc(db, 'admins', firebaseUser.uid), sanitizeForFirestore({
            uid: firebaseUser.uid,
            email: firebaseUser.email || SOLE_SUPER_ADMIN_EMAIL,
            role: 'super_admin',
            grantedAt: now,
          }), { merge: true });
          setUserProfile(elevatedProfile);
          setIsAdmin(true);

          // Proactively sanitize any unauthorized admin accounts in background
          auditAndRevokeUnauthorizedAdmins(db, firebaseUser).catch((e) =>
            console.warn('Background admin audit notice:', e)
          );
        } else {
          // ANY other account: ensure they do NOT retain super_admin role
          if (profile.role === 'super_admin' || isRevokedAdminEmail(firebaseUser.email)) {
            console.warn(`[SECURITY] Revoking unauthorized admin role from: ${firebaseUser.email || firebaseUser.uid}`);
            const now = new Date().toISOString();
            profile = {
              ...profile,
              role: 'patient',
              updatedAt: now,
            };
            try {
              await updateDoc(userDocRef, {
                role: 'patient',
                updatedAt: now,
              });
            } catch (e) {
              console.warn('Notice updating profile during role revocation:', e);
            }

            // Remove any dangling admin record
            try {
              await deleteDoc(doc(db, 'admins', firebaseUser.uid));
            } catch {}
          }

          // Hydrate gender in-memory from patient_profiles when role === 'patient'
          // (Never written to /users/{uid} so strict Firestore rules allowlist stays intact)
          if (profile.role === 'patient' && !profile.gender) {
            try {
              const pSnap = await getDoc(doc(db, 'patient_profiles', firebaseUser.uid));
              if (pSnap.exists()) {
                const pGender = (pSnap.data() as { gender?: string }).gender;
                if (pGender === 'female' || pGender === 'male') {
                  profile = { ...profile, gender: pGender };
                }
              }
            } catch (e) {
              console.warn('Notice loading patient gender:', e);
            }
          }

          setUserProfile(profile);
          setIsAdmin(false);
        }
        setNeedsOnboarding(false);
      } else {
        // If user document does not exist yet:
        if (isVerifiedSuperAdminEmail) {
          const now = new Date().toISOString();
          const adminProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || SOLE_SUPER_ADMIN_EMAIL,
            displayName: firebaseUser.displayName || 'Super Administrator',
            role: 'super_admin',
            status: 'approved',
            createdAt: now,
            updatedAt: now,
          };

          // Save admin record and user profile
          await setDoc(doc(db, 'admins', firebaseUser.uid), sanitizeForFirestore({
            uid: firebaseUser.uid,
            email: firebaseUser.email || SOLE_SUPER_ADMIN_EMAIL,
            role: 'super_admin',
            grantedAt: now,
          }));

          await setDoc(userDocRef, sanitizeForFirestore(adminProfile));
          setUserProfile(adminProfile);
          setIsAdmin(true);
          setNeedsOnboarding(false);
        } else {
          setUserProfile(null);
          setIsAdmin(false);
          setNeedsOnboarding(true);
        }
      }
    } catch (err: unknown) {
      console.error('Error fetching user profile:', err);
      // Handled gracefully without crashing app
      setAuthError(err instanceof Error ? err.message : 'Failed to retrieve profile');
    }
    })().finally(() => {
      if (profileLoadInFlightRef.current?.uid === firebaseUser.uid) {
        profileLoadInFlightRef.current = null;
      }
    });

    profileLoadInFlightRef.current = { uid: firebaseUser.uid, promise: task };
    return task;
  };

  // Clean up any legacy demo keys on mount
  useEffect(() => {
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (lastUidRef.current && lastUidRef.current !== currentUser.uid) {
          // Account switched directly — flush all cached session data first
          setUserProfile(null);
          setIsAdmin(false);
          setNeedsOnboarding(false);
          await clearAllUserSessionCaches();
        }
        lastUidRef.current = currentUser.uid;
        try {
          localStorage.removeItem(DEMO_STORAGE_KEY);
        } catch {}
        setUser(currentUser);
        await loadUserProfile(currentUser);
        setLoading(false);
      } else {
        if (lastUidRef.current) {
          await clearAllUserSessionCaches();
        }
        lastUidRef.current = null;
        setUser(null);
        setUserProfile(null);
        setIsAdmin(false);
        setNeedsOnboarding(false);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        try {
          localStorage.removeItem(DEMO_STORAGE_KEY);
        } catch {}
        setUnauthorizedDomainDetected(false);
        setShowDomainHelp(false);
        await loadUserProfile(result.user);
      }
    } catch (err: unknown) {
      const rawError = err instanceof Error ? err.message : 'Google sign-in failed';
      const errorCode = (typeof err === 'object' && err !== null && 'code' in err) 
        ? String((err as { code: unknown }).code) 
        : '';

      // 1. User intentionally closed popup or cancelled popup request - this is normal dismissal, not an error
      if (
        errorCode === 'auth/popup-closed-by-user' ||
        errorCode === 'auth/cancelled-popup-request' ||
        rawError.includes('auth/popup-closed-by-user') ||
        rawError.includes('auth/cancelled-popup-request')
      ) {
        // Clear any prior auth error; do not display error banner or log console.error
        setAuthError(null);
        return;
      }

      // 2. Browser blocked popup window
      if (errorCode === 'auth/popup-blocked' || rawError.includes('auth/popup-blocked')) {
        const popupMsg = 'تم حظر النافذة المنبثقة من قبل متصفحك. يرجى السماح بالنوافذ المنبثقة لموقع المنصة لإتمام تسجيل الدخول عبر Google.';
        console.warn('Firebase Auth: Popup blocked by browser');
        setAuthError(popupMsg);
        return;
      }

      // 3. Unauthorized domain
      const isDomainUnauthorized = 
        errorCode === 'auth/unauthorized-domain' || 
        rawError.includes('auth/unauthorized-domain');

      if (isDomainUnauthorized) {
        setUnauthorizedDomainDetected(true);
        setShowDomainHelp(true);
        const detailedMsg = `Firebase: Error (auth/unauthorized-domain). نطاق المعاينة السحابي (${window.location.hostname}) غير مضاف في قائمة النطاقات المصرح بها في Firebase Console. يمكنك نسخه وإضافته لتفعيل تسجيل الدخول.`;
        console.warn('Firebase Auth Unauthorized Domain detected:', detailedMsg);
        setAuthError(detailedMsg);
        return;
      }

      // 4. Network error
      if (errorCode === 'auth/network-request-failed' || rawError.includes('auth/network-request-failed')) {
        const netMsg = 'تعذر الاتصال بخوادم المصادقة. يرجى التحقق من اتصال الإنترنت والمحاولة لاحقاً.';
        console.warn('Firebase Auth Network Issue:', netMsg);
        setAuthError(netMsg);
        return;
      }

      // 5. General fallback error
      console.warn('Firebase Authentication Notice:', rawError);
      setAuthError(rawError);
    } finally {
      setLoading(false);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
      if (result.user) {
        try {
          localStorage.removeItem(DEMO_STORAGE_KEY);
        } catch {}
        setUnauthorizedDomainDetected(false);
        setShowDomainHelp(false);
        await loadUserProfile(result.user);
      }
    } catch (err: unknown) {
      console.error('Email Sign-In Error:', err);
      const code = (typeof err === 'object' && err !== null && 'code' in err)
        ? String((err as { code: unknown }).code)
        : '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setAuthError('البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى التحقق وإعادة المحاولة.');
      } else if (code === 'auth/invalid-email') {
        setAuthError('صيغة البريد الإلكتروني غير صالحة.');
      } else if (code === 'auth/too-many-requests') {
        setAuthError('تم حظر المحاولات مؤقتاً بسبب تكرار المحاولات الخاطئة. حاول لاحقاً.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'فشل تسجيل الدخول بالبريد الإلكتروني');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUpWithEmail = async (
    email: string, 
    pass: string, 
    displayName: string, 
    role: UserRole, 
    phone?: string
  ) => {
    setLoading(true);
    setAuthError(null);
    try {
      await clearAllUserSessionCaches();
      const result = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      const createdUser = result.user;
      if (displayName) {
        await updateProfile(createdUser, { displayName });
      }

      // Registration via public sign-up NEVER grants Super Admin privileges
      if (role === 'super_admin') {
        throw new Error('لا يمكن التسجيل كمسؤول أعلى عبر نموذج التسجيل العام (Unauthorized)');
      }

      const effectiveRole: UserRole = role;
      const effectiveStatus: AccountStatus = effectiveRole === 'patient' 
        ? 'approved' 
        : 'pending';

      const now = new Date().toISOString();
      const assignedId = await ensureUserAccountId(
        db,
        createdUser.uid,
        effectiveRole,
        displayName || createdUser.email?.split('@')[0] || 'User',
        '',
        createdUser.email || email.trim(),
        phone || ''
      );

      const profile: UserProfile = {
        uid: createdUser.uid,
        email: createdUser.email || email.trim(),
        displayName: displayName || createdUser.email?.split('@')[0] || 'User',
        role: effectiveRole,
        status: effectiveStatus,
        accountId: assignedId,
        ...(effectiveRole === 'patient' && assignedId ? { medicalId: assignedId } : {}),
        phone: phone || '',
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'users', createdUser.uid), sanitizeForFirestore(profile));

      if (effectiveRole === 'patient') {
        const initialPatientDoc: PatientProfile = {
          patientId: createdUser.uid,
          fullName: profile.displayName,
          medicalId: assignedId,
          email: profile.email,
          phone: profile.phone || '',
          governorate: 'بغداد (Baghdad)',
          address: '',
          bloodType: 'Unknown',
          chronicDiseases: [],
          allergies: [],
          currentMedications: [],
          createdAt: now,
          updatedAt: now,
        };
        await setDoc(doc(db, 'patient_profiles', createdUser.uid), sanitizeForFirestore(initialPatientDoc), { merge: true }).catch(() => {});
      }

      setIsAdmin(false);
      setUserProfile(profile);
      setNeedsOnboarding(false);
      recordRealMetricEvent('user');
      try {
        localStorage.removeItem(DEMO_STORAGE_KEY);
      } catch {}
    } catch (err: unknown) {
      console.error('Email Sign-Up Error:', err);
      const code = (typeof err === 'object' && err !== null && 'code' in err)
        ? String((err as { code: unknown }).code)
        : '';
      if (code === 'auth/email-already-in-use') {
        setAuthError('هذا البريد الإلكتروني مسجل مسبقاً. يمكنك تسجيل الدخول مباشرة.');
      } else if (code === 'auth/weak-password') {
        setAuthError('كلمة المرور ضعيفة. يجب أن تتكون من 6 أحرف على الأقل.');
      } else if (code === 'auth/invalid-email') {
        setAuthError('صيغة البريد الإلكتروني غير صالحة.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'فشل إنشاء الحساب');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendPasswordReset = async (email: string) => {
    setLoading(true);
    setAuthError(null);
    const trimmedEmail = email ? email.trim() : '';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      const errText = 'يرجى إدخال عنوان البريد الإلكتروني أولاً.';
      setAuthError(errText);
      setLoading(false);
      throw new Error(errText);
    }
    if (!emailRegex.test(trimmedEmail)) {
      const errText = 'صيغة البريد الإلكتروني غير صالحة. يرجى كتابة بريد إلكتروني صحيح (مثال: user@example.com).';
      setAuthError(errText);
      setLoading(false);
      throw new Error(errText);
    }

    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
    } catch (err: unknown) {
      console.error('Password Reset Error:', err);
      const code = (typeof err === 'object' && err !== null && 'code' in err)
        ? String((err as { code: unknown }).code)
        : '';
      let userFriendlyMsg = 'فشل إرسال رابط استعادة كلمة المرور، يرجى المحاولة لاحقاً.';
      if (code === 'auth/user-not-found') {
        userFriendlyMsg = 'لم يتم العثور على أي حساب مسجل بهذا البريد الإلكتروني في النظام.';
      } else if (code === 'auth/invalid-email') {
        userFriendlyMsg = 'صيغة البريد الإلكتروني غير صالحة.';
      } else if (code === 'auth/missing-email') {
        userFriendlyMsg = 'يرجى إدخال عنوان البريد الإلكتروني.';
      } else if (code === 'auth/too-many-requests') {
        userFriendlyMsg = 'تم حظر إرسال الطلبات مؤقتاً بسبب تكرار المحاولات. يرجى الانتظار بضع دقائق ثم المحاولة مجدداً.';
      } else if (code === 'auth/network-request-failed') {
        userFriendlyMsg = 'تعذر الاتصال بخوادم المصادقة. يرجى التحقق من اتصال الإنترنت والمحاولة ثانية.';
      } else if (err instanceof Error) {
        userFriendlyMsg = err.message;
      }
      setAuthError(userFriendlyMsg);
      throw new Error(userFriendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const signInAsDemoUser = async () => {
    console.warn('Demo accounts have been removed. Please log in with genuine Firebase Auth.');
  };

  const exitDemoMode = () => {};

  const signOut = async () => {
    setLoading(true);
    try {
      const currentUid = auth.currentUser?.uid || user?.uid;
      if (currentUid) {
        await unregisterDevicePush(currentUid).catch(() => {});
      }
      await clearAllUserSessionCaches();
      await firebaseSignOut(auth);
      lastUidRef.current = null;
      setUser(null);
      setUserProfile(null);
      setIsAdmin(false);
      setNeedsOnboarding(false);
      setAuthError(null);
      navigateTo('home');
    } catch (err: unknown) {
      console.error('Sign out error:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  const registerAsPatient = async (
    displayNameOrPayload?:
      | string
      | {
          displayName: string;
          phone: string;
          gender: 'male' | 'female';
          dateOfBirth: string;
          governorate: string;
          hasMedicalConditions: boolean;
          medicalConditions?: string[];
        },
    phoneArg?: string
  ) => {
    const activeUser = auth.currentUser || user;
    if (!activeUser) throw new Error('User must be authenticated');
    if (isVerifiedSuperAdmin(activeUser)) {
      throw new Error('حساب المشرف العام (bcgmoc@gmail.com) مخصص حصرياً للإدارة العليا ولا يمكن تحويله إلى حساب مريض تشغيلي.');
    }
    const payload =
      typeof displayNameOrPayload === 'object' && displayNameOrPayload !== null
        ? displayNameOrPayload
        : {
            displayName: displayNameOrPayload || activeUser.displayName || 'Patient',
            phone: phoneArg || '',
            gender: undefined,
            dateOfBirth: undefined,
            governorate: 'بغداد (Baghdad)',
            hasMedicalConditions: false,
            medicalConditions: [] as string[],
          };

    const computedAge = (() => {
      if (!payload.dateOfBirth) return undefined;
      const b = new Date(payload.dateOfBirth);
      if (isNaN(b.getTime())) return undefined;
      const t = new Date();
      let age = t.getFullYear() - b.getFullYear();
      const md = t.getMonth() - b.getMonth();
      if (md < 0 || (md === 0 && t.getDate() < b.getDate())) age--;
      return age >= 0 ? age : undefined;
    })();

    setLoading(true);
    setAuthError(null);
    try {
      // Guard against overwriting an existing account of another role or admin-deleted tombstone
      const existingSnap = await getDoc(doc(db, 'users', activeUser.uid));
      if (existingSnap.exists()) {
        const existingData = existingSnap.data() as UserProfile;
        if (existingData.role !== 'patient' && existingData.status !== 'incomplete') {
          throw new Error('هذا الحساب مسجل مسبقاً بصفة مهنية أخرى ولا يمكن تحويله أو دمج بياناته مع حساب مريض.');
        }
      }
      try {
        const tombSnap = await getDoc(doc(db, 'deleted_accounts', activeUser.uid));
        if (tombSnap.exists()) {
          const tomb = tombSnap.data() as DeletedAccountTombstone;
          if (tomb.deletedBy === 'admin') {
            throw new Error('هذا الحساب محذوف من قبل إدارة المنصة ولا يمكن إعادة تفعيله.');
          }
          if (tomb.deletedBy === 'self') {
            await deleteDoc(doc(db, 'deleted_accounts', activeUser.uid)).catch(() => {});
          }
        }
      } catch (tErr: any) {
        if (tErr?.message?.includes('محذوف')) throw tErr;
      }

      const now = new Date().toISOString();
      const medicalId = await ensureUserAccountId(
        db,
        activeUser.uid,
        'patient',
        payload.displayName || activeUser.displayName || 'Patient',
        '',
        activeUser.email || '',
        payload.phone || ''
      );
      const profile: UserProfile = {
        uid: activeUser.uid,
        email: activeUser.email || '',
        displayName: payload.displayName || activeUser.displayName || 'Patient',
        role: 'patient',
        status: 'approved', // Patient access is free and immediately available
        accountId: medicalId,
        medicalId,
        governorate: payload.governorate || 'بغداد (Baghdad)',
        phone: payload.phone || '',
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'users', activeUser.uid), sanitizeForFirestore(profile));

      // Ensure persistent patient_profiles document exists cleanly with registration values & never overwrites existing medical history
      let resolvedPatientGender: 'male' | 'female' | undefined = payload.gender;
      try {
        const pRef = doc(db, 'patient_profiles', activeUser.uid);
        const pSnap = await getDoc(pRef);
        const cleanedConditions = Array.isArray(payload.medicalConditions)
          ? payload.medicalConditions.map((s) => s.trim()).filter(Boolean)
          : [];

        if (!pSnap.exists()) {
          const initialPatientDoc: PatientProfile = {
            patientId: activeUser.uid,
            fullName: profile.displayName,
            medicalId,
            email: profile.email,
            phone: profile.phone || '',
            governorate: payload.governorate || 'بغداد (Baghdad)',
            address: '',
            gender: payload.gender,
            dateOfBirth: payload.dateOfBirth || '',
            ageYears: computedAge,
            hasMedicalConditions: Boolean(payload.hasMedicalConditions),
            medicalConditions: payload.hasMedicalConditions ? cleanedConditions : [],
            bloodType: 'Unknown',
            chronicDiseases: [],
            allergies: [],
            currentMedications: [],
            createdAt: now,
            updatedAt: now,
          };
          await setDoc(pRef, sanitizeForFirestore(initialPatientDoc));
        } else {
          const existingP = pSnap.data() as PatientProfile;
          if (existingP.gender === 'female' || existingP.gender === 'male') {
            resolvedPatientGender = existingP.gender;
          }
          const mergePatch: Partial<PatientProfile> = {
            fullName: existingP.fullName || profile.displayName,
            medicalId: existingP.medicalId || medicalId,
            phone: existingP.phone || profile.phone || '',
            governorate: existingP.governorate || payload.governorate || 'بغداد (Baghdad)',
            gender: existingP.gender || payload.gender,
            dateOfBirth: existingP.dateOfBirth || payload.dateOfBirth || '',
            ageYears: existingP.ageYears ?? computedAge,
            hasMedicalConditions:
              existingP.hasMedicalConditions !== undefined
                ? existingP.hasMedicalConditions
                : Boolean(payload.hasMedicalConditions),
            medicalConditions:
              existingP.medicalConditions && existingP.medicalConditions.length > 0
                ? existingP.medicalConditions
                : payload.hasMedicalConditions
                ? cleanedConditions
                : [],
            updatedAt: now,
          };
          await setDoc(pRef, sanitizeForFirestore(mergePatch), { merge: true });
        }
      } catch (e) {
        console.warn('Patient profile record initialization notice:', e);
      }

      setUserProfile({ ...profile, gender: resolvedPatientGender });
      setNeedsOnboarding(false);
      recordRealMetricEvent('user');
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.CREATE, `users/${activeUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const applyForProfessionalRole = async (payload: {
    role: UserRole;
    displayName: string;
    licenseNumber: string;
    facilityName: string;
    governorate: string;
    phone: string;
  }) => {
    const activeUser = auth.currentUser || user;
    if (!activeUser) throw new Error('User must be authenticated');
    if (payload.role === 'super_admin') {
      throw new Error('لا يمكن التقديم على صلاحية المشرف العام (Unauthorized)');
    }
    if (isVerifiedSuperAdmin(activeUser)) {
      throw new Error('حساب المشرف العام (bcgmoc@gmail.com) مخصص حصرياً للإدارة العليا ولا يمكن تحويله إلى صفة مهنية أخرى.');
    }
    setLoading(true);
    setAuthError(null);
    try {
      const existingSnap = await getDoc(doc(db, 'users', activeUser.uid));
      if (existingSnap.exists()) {
        const existingData = existingSnap.data() as UserProfile;
        if (existingData.role !== payload.role && existingData.status !== 'incomplete') {
          throw new Error('هذا الحساب مسجل مسبقاً في بوابة أخرى ولا يمكن إعادة تسجيله بصلاحية مختلفة.');
        }
      }
      try {
        const tombSnap = await getDoc(doc(db, 'deleted_accounts', activeUser.uid));
        if (tombSnap.exists()) {
          const tomb = tombSnap.data() as DeletedAccountTombstone;
          if (tomb.deletedBy === 'admin') {
            throw new Error('هذا الحساب محذوف من قبل إدارة المنصة ولا يمكن إعادة تقديمه.');
          }
          if (tomb.deletedBy === 'self') {
            await deleteDoc(doc(db, 'deleted_accounts', activeUser.uid)).catch(() => {});
          }
        }
      } catch (tErr: any) {
        if (tErr?.message?.includes('محذوف')) throw tErr;
      }

      const now = new Date().toISOString();
      const assignedId = await ensureUserAccountId(
        db,
        activeUser.uid,
        payload.role,
        payload.displayName,
        payload.facilityName,
        activeUser.email || '',
        payload.phone
      );

      const profile: UserProfile = {
        uid: activeUser.uid,
        email: activeUser.email || '',
        displayName: payload.displayName,
        role: payload.role,
        status: 'pending',
        accountId: assignedId,
        licenseNumber: payload.licenseNumber || '',
        facilityName: payload.facilityName || '',
        governorate: payload.governorate || 'بغداد (Baghdad)',
        phone: payload.phone || '',
        createdAt: now,
        updatedAt: now,
      };

      await setDoc(doc(db, 'users', activeUser.uid), sanitizeForFirestore(profile));
      setUserProfile(profile);
      setNeedsOnboarding(false);
      recordRealMetricEvent('user');

      // Notify Super Admin (bcgmoc@gmail.com) of the new accreditation request
      try {
        const adminsSnap = await getDocs(collection(db, 'admins'));
        const superAdminDoc = adminsSnap.docs.find(d => (d.data().email || '').toLowerCase() === SOLE_SUPER_ADMIN_EMAIL.toLowerCase());
        if (superAdminDoc) {
          await notifySuperAdminAccreditationRequest({
            adminUid: superAdminDoc.id,
            applicantName: payload.displayName,
            role: payload.role,
            licenseNumber: payload.licenseNumber || 'PENDING-VERIF',
          });
        }
      } catch (e) {
        console.warn('Super admin push dispatch notice:', e);
      }
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.CREATE, `users/${activeUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user);
    }
  };

  const updateUserStatusByAdmin = async (targetUid: string, newStatus: AccountStatus) => {
    assertSuperAdminAccess(user);
    if (!isAdmin) throw new Error('Unauthorized administrative action');
    try {
      const targetRef = doc(db, 'users', targetUid);
      const targetSnap = await getDoc(targetRef);
      const targetData = targetSnap.exists() ? (targetSnap.data() as UserProfile) : null;

      await updateDoc(targetRef, {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });

      // Dispatch push notification to user regarding approval status
      if (targetData && (newStatus === 'approved' || newStatus === 'rejected' || newStatus === 'suspended')) {
        try {
          await notifyUserAccountApprovalStatus({
            userUid: targetUid,
            userRole: targetData.role || 'patient',
            isApproved: newStatus === 'approved',
          });
        } catch (e) {
          console.warn('User status notification dispatch notice:', e);
        }
      }

      if (user && targetUid === user.uid) {
        await refreshProfile();
      }
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
    }
  };

  const deleteUserByAdmin = async (targetUid: string) => {
    assertSuperAdminAccess(user);
    if (!isAdmin || !user) throw new Error('Unauthorized administrative action');
    try {
      await cleanupTargetUserData(targetUid, 'admin', user.uid, 'Deleted by Super Admin');
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.DELETE, `users/${targetUid}`);
    }
  };

  const deletePendingUsersByAdmin = async (): Promise<number> => {
    assertSuperAdminAccess(user);
    if (!isAdmin || !user) throw new Error('Unauthorized administrative action');
    try {
      const usersCol = collection(db, 'users');
      const snap = await getDocs(usersCol);
      const pendingDocs = snap.docs.filter((d) => {
        const data = d.data() as UserProfile;
        return data.status === 'pending' || data.status === 'incomplete';
      });

      let count = 0;
      for (const d of pendingDocs) {
        await cleanupTargetUserData(d.id, 'admin', user.uid, 'Bulk deleted pending/incomplete account by Super Admin');
        count++;
      }
      return count;
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.DELETE, 'users');
      return 0;
    }
  };

  const fetchPendingUsersForAdmin = async (): Promise<UserProfile[]> => {
    assertSuperAdminAccess(user);
    if (!isAdmin) throw new Error('Unauthorized');
    try {
      const usersCol = collection(db, 'users');
      const snap = await getDocs(usersCol);
      return snap.docs
        .map((d) => d.data() as UserProfile)
        .filter((u) => u.status === 'pending' || u.status === 'incomplete');
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.LIST, 'users');
    }
  };

  const deleteOwnAccountPermanently = async (): Promise<void> => {
    const currentUser = auth.currentUser || user;
    if (!currentUser) throw new Error('No user is currently authenticated');
    const targetUid = currentUser.uid;

    // Preserve user snapshot temporarily so we can restore if Firebase Auth requires recent login
    let userSnapshotBeforeDelete: UserProfile | null = null;
    try {
      const snap = await getDoc(doc(db, 'users', targetUid));
      if (snap.exists()) {
        userSnapshotBeforeDelete = snap.data() as UserProfile;
      }
    } catch {}

    // 1. Delete Firebase Auth user FIRST if possible? Note: if we delete Firestore after Auth delete,
    // Firestore rules would reject because request.auth == null. So we clean up Firestore first,
    // and roll back userSnapshotBeforeDelete if Auth delete fails with auth/requires-recent-login.
    try {
      await unregisterDevicePush(targetUid).catch(() => {});
      await cleanupTargetUserData(targetUid, 'self', targetUid, 'Self-service permanent account deletion');
    } catch (fsErr) {
      console.warn('Notice cleaning up account documents during deletion:', fsErr);
    }

    // 2. Delete Firebase Auth user credentials
    if (auth.currentUser) {
      try {
        await auth.currentUser.delete();
      } catch (authErr: any) {
        // Restore user doc & remove tombstone if recent login is required so account isn't stranded
        if (authErr?.code === 'auth/requires-recent-login') {
          if (userSnapshotBeforeDelete) {
            await setDoc(doc(db, 'users', targetUid), sanitizeForFirestore(userSnapshotBeforeDelete)).catch(() => {});
          }
          await deleteDoc(doc(db, 'deleted_accounts', targetUid)).catch(() => {});
          throw new Error(
            'يتطلب حذف الحساب تسجيل دخول حديث لأسباب أمنية. يرجى تسجيل الخروج ثم إعادة تسجيل الدخول والمحاولة ثانية.'
          );
        }
        throw authErr;
      }
    }

    // 3. Flush all local/session caches and reset UI state completely
    await clearAllUserSessionCaches();
    lastUidRef.current = null;
    setUser(null);
    setUserProfile(null);
    setIsAdmin(false);
    setNeedsOnboarding(false);
    setAuthError(null);
    navigateTo('home');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        authError,
        isAdmin,
        needsOnboarding,
        unauthorizedDomainDetected,
        showDomainHelp,
        setShowDomainHelp,
        isDemoMode,
        currentHostname,
        firebaseProjectId,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        signInAsDemoUser,
        exitDemoMode,
        signOut,
        clearAuthError,
        registerAsPatient,
        applyForProfessionalRole,
        refreshProfile,
        updateUserStatusByAdmin,
        deleteUserByAdmin,
        deletePendingUsersByAdmin,
        fetchPendingUsersForAdmin,
        deleteOwnAccountPermanently,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
