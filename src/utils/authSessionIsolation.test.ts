/**
 * Automated Verification Suite for Auth, Session Isolation, & Account Deletion Security
 * Validates:
 * 1. clearAllUserSessionCaches() & normalizeEmailKey() runtime behavior
 * 2. Account switch UID isolation & cache flushing
 * 3. Deleted account tombstone enforcement preventing stale re-login/onboarding
 * 4. Public registration super_admin rejection & cross-role safeguards
 * 5. PortalShellView UID-keyed workspace remount isolation
 */

import fs from 'node:fs';
import path from 'node:path';
import { clearAllUserSessionCaches, normalizeEmailKey } from './sessionCleanup';

export interface AuthIsolationTestResult {
  suite: string;
  name: string;
  passed: boolean;
  message?: string;
}

export async function runAuthSessionIsolationTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: AuthIsolationTestResult[];
}> {
  const results: AuthIsolationTestResult[] = [];

  const assert = (suite: string, name: string, condition: boolean, failMessage?: string) => {
    results.push({
      suite,
      name,
      passed: Boolean(condition),
      message: condition ? undefined : failMessage,
    });
  };

  // ==============================================================
  // 1. normalizeEmailKey HELPER
  // ==============================================================
  assert(
    'Identity Normalization',
    'normalizeEmailKey trims whitespace and lowercases emails',
    normalizeEmailKey('  Dr.Ahmed@MEDORA.iq ') === 'dr.ahmed@medora.iq',
    `Got ${normalizeEmailKey('  Dr.Ahmed@MEDORA.iq ')}`
  );
  assert(
    'Identity Normalization',
    'normalizeEmailKey safely handles null/undefined',
    normalizeEmailKey(null) === '' && normalizeEmailKey(undefined) === '',
    'Failed on null/undefined'
  );

  // ==============================================================
  // 2. clearAllUserSessionCaches RUNTIME SIMULATION
  // ==============================================================
  const origWindow = (globalThis as any).window;
  const localMap = new Map<string, string>([
    ['m737_demo_role_v1', 'doctor'],
    ['m737_push_preferences_v1', '{"enabled":true}'],
    ['m737_read_notifications_v1', '["n1"]'],
    ['medora_custom_cache_uid1', 'stale'],
    ['medora_theme_lang', 'ar'],
    ['unrelated_app_key', 'keep'],
  ]);
  const tracker = { sessionCleared: false };

  const mockWindow = {
    localStorage: {
      get length() {
        return localMap.size;
      },
      key(i: number) {
        return Array.from(localMap.keys())[i] ?? null;
      },
      getItem(k: string) {
        return localMap.has(k) ? localMap.get(k)! : null;
      },
      removeItem(k: string) {
        localMap.delete(k);
      },
    },
    sessionStorage: {
      clear() {
        tracker.sessionCleared = true;
      },
    },
  };

  Object.defineProperty(globalThis, 'window', {
    value: mockWindow,
    configurable: true,
  });

  const removed = await clearAllUserSessionCaches({
    preserveKeys: ['medora_theme_lang'],
    clearServiceWorkerCaches: false,
  });

  Object.defineProperty(globalThis, 'window', {
    value: origWindow,
    configurable: true,
  });

  assert(
    'Session Cache Cleanup',
    'Removes all m737_ and dynamic medora_ session keys from localStorage',
    !localMap.has('m737_demo_role_v1') &&
      !localMap.has('m737_push_preferences_v1') &&
      !localMap.has('medora_custom_cache_uid1') &&
      removed.includes('m737_demo_role_v1') &&
      removed.includes('medora_custom_cache_uid1'),
    `Remaining keys: ${Array.from(localMap.keys()).join(', ')}`
  );

  assert(
    'Session Cache Cleanup',
    'Respects preserveKeys and leaves unrelated storage keys intact',
    localMap.get('medora_theme_lang') === 'ar' && localMap.get('unrelated_app_key') === 'keep',
    'Unexpectedly deleted preserved or unrelated keys'
  );

  assert(
    'Session Cache Cleanup',
    'Clears sessionStorage on logout/account switch/deletion',
    tracker.sessionCleared === true,
    'sessionStorage.clear() was not invoked'
  );

  // ==============================================================
  // 3. AUTHCONTEXT & PORTAL SHELL STRUCTURAL INVARIANTS
  // ==============================================================
  const authContextPath = path.resolve(process.cwd(), 'src/context/AuthContext.tsx');
  const authContextSrc = fs.readFileSync(authContextPath, 'utf8');

  assert(
    'AuthContext Security',
    'Account UID change triggers clearAllUserSessionCaches() and resets userProfile/isAdmin',
    authContextSrc.includes('lastUidRef.current !== currentUser.uid') &&
      authContextSrc.includes('await clearAllUserSessionCaches()'),
    'Missing UID switch cache flush in AuthContext.tsx'
  );

  assert(
    'AuthContext Security',
    'Checks deleted_accounts tombstone before allowing onboarding for admin-deleted accounts',
    authContextSrc.includes("doc(db, 'deleted_accounts', firebaseUser.uid)") &&
      authContextSrc.includes("tombstone.deletedBy === 'admin'") &&
      authContextSrc.includes('firebaseSignOut(auth)'),
    'Missing deleted_accounts tombstone enforcement in AuthContext.tsx'
  );

  assert(
    'AuthContext Security',
    'Public email sign-up explicitly rejects super_admin registration',
    authContextSrc.includes("if (role === 'super_admin')") &&
      authContextSrc.includes('signUpWithEmail'),
    'Public super_admin signup block missing'
  );

  assert(
    'AuthContext Security',
    'Demo mode is permanently disabled (isDemoMode: false)',
    authContextSrc.includes('const isDemoMode = false;'),
    'isDemoMode must be permanently false in production AuthContext'
  );

  const portalShellPath = path.resolve(process.cwd(), 'src/components/PortalShellView.tsx');
  const portalShellSrc = fs.readFileSync(portalShellPath, 'utf8');

  assert(
    'Workspace Isolation',
    'All portal workspaces in PortalShellView are keyed by user.uid to prevent cross-user state bleed',
    portalShellSrc.includes('key={`doctor-${user?.uid') &&
      portalShellSrc.includes('key={`patient-${user?.uid') &&
      portalShellSrc.includes('key={`pharmacy-${user?.uid') &&
      portalShellSrc.includes('key={`wholesaler-${user?.uid') &&
      portalShellSrc.includes('key={`laboratory-${user?.uid') &&
      portalShellSrc.includes('key={`radiology-${user?.uid'),
    'Not all portal workspaces are keyed by user.uid'
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}

const summary = await runAuthSessionIsolationTests();
console.log(`\n================ AUTH & SESSION ISOLATION TEST SUMMARY ================`);
console.log(`Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
summary.results.forEach((r, idx) => {
  console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] #${idx + 1} (${r.suite}) ${r.name}`);
  if (!r.passed && r.message) {
    console.error(`         Error: ${r.message}`);
  }
});
console.log(`=======================================================================\n`);
if (summary.failed > 0) {
  process.exit(1);
}
