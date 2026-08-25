import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "../config/env.js";
import { AuthContext } from "../types/express.js";

let app: App | null = null;

export function getFirebaseAdminApp(): App {
  if (!app) {
    const existingApps = getApps();
    if (existingApps.length > 0 && existingApps[0]) {
      app = existingApps[0];
    } else {
      const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;

      if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
        throw new Error(
          "Firebase Admin initialization failed: Missing required environment variables (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)."
        );
      }

      app = initializeApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY,
        }),
      });
    }
  }
  return app;
}

export async function verifyFirebaseToken(idToken: string): Promise<AuthContext> {
  const adminApp = getFirebaseAdminApp();
  const auth = getAuth(adminApp);
  const decoded = await auth.verifyIdToken(idToken);

  return {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture,
  };
}
