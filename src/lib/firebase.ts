import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

const env = import.meta.env;
export const useEmulator = env.VITE_USE_EMULATOR === 'true';

const firebaseConfig = useEmulator
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
      authDomain: 'demo-hirer.firebaseapp.com',
      projectId: 'demo-hirer',
      appId: 'demo-app',
    }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
      appId: env.VITE_FIREBASE_APP_ID || undefined,
    };

export const firebaseConfigured = useEmulator || Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function wireEmulators(a: Auth, d: Firestore) {
  const host = typeof location !== 'undefined' ? location.hostname : '127.0.0.1';
  connectAuthEmulator(a, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(d, host, 8080);
}

/** Lazily initialise Firebase (the demo never calls this). */
export function fb(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!firebaseConfigured) {
    throw new Error('Firebase is not configured. Copy .env.example to .env.local and fill in the values.');
  }
  if (!app) {
    app = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    if (useEmulator) wireEmulators(auth, db);
  }
  return { app, auth: auth as Auth, db: db as Firestore };
}

let authReady: Promise<string> | null = null;

/** Resolves with this browser's anonymous uid, signing in if needed. */
export function ensureSignedIn(): Promise<string> {
  if (authReady) return authReady;
  if (!firebaseConfigured) {
    return Promise.reject(new Error('Firebase is not configured yet (see README: .env.local).'));
  }
  const { auth: a } = fb();
  authReady = new Promise<string>((resolve, reject) => {
    const unsub = onAuthStateChanged(
      a,
      async (user) => {
        unsub();
        try {
          if (user) resolve(user.uid);
          else resolve((await signInAnonymously(a)).user.uid);
        } catch (e) {
          authReady = null;
          reject(e);
        }
      },
      (e) => {
        authReady = null;
        reject(e);
      },
    );
  });
  return authReady;
}

/**
 * A separate Firebase app with its own in-memory anonymous user (dev-only class simulator).
 * Only Auth is used; the simulator writes through the Firestore REST API so that 15+ bots
 * do not each hold open streaming connections.
 */
export async function createIsolatedUser(name: string): Promise<{ uid: string; app: FirebaseApp; token: () => Promise<string> }> {
  const isoApp = initializeApp(firebaseConfig, name);
  const isoAuth = initializeAuth(isoApp, { persistence: inMemoryPersistence });
  if (useEmulator) connectAuthEmulator(isoAuth, `http://${location.hostname}:9099`, { disableWarnings: true });
  const cred = await signInAnonymously(isoAuth);
  return { uid: cred.user.uid, app: isoApp, token: () => cred.user.getIdToken() };
}

export function firestoreRestDocsBase(): string {
  const project = firebaseConfig.projectId;
  const root = useEmulator ? `http://${location.hostname}:8080/v1` : 'https://firestore.googleapis.com/v1';
  return `${root}/projects/${project}/databases/(default)/documents`;
}
