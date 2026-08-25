import {
  GoogleOneTapSignIn,
  isSuccessResponse,
  isCancelledResponse,
} from "react-native-nitro-google-signin";
import { requireEnv } from "./env";

let isConfigured = false;

export function configureGoogleSignIn(): void {
  if (isConfigured) return;

  const webClientId = requireEnv(
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"
  );

  GoogleOneTapSignIn.configure({
    webClientId,
  });

  isConfigured = true;
}

export interface GoogleSignInResult {
  idToken: string | null;
  cancelled?: boolean;
}

export async function signInWithGoogleNative(): Promise<GoogleSignInResult> {
  configureGoogleSignIn();

  try {
    await GoogleOneTapSignIn.checkPlayServices(true);
    const response = await GoogleOneTapSignIn.signIn();
    console.log("[GoogleSignIn] Native response:", JSON.stringify(response));

    if (isSuccessResponse(response)) {
      const idToken = response.data.idToken || null;
      return { idToken, cancelled: false };
    }

    if (isCancelledResponse(response)) {
      console.log("[GoogleSignIn] User cancelled or no credentials available.");
      return { idToken: null, cancelled: true };
    }

    console.warn("[GoogleSignIn] Unhandled response type:", response);
    return { idToken: null, cancelled: false };
  } catch (error: unknown) {
    console.error("[GoogleSignIn] Native error:", error);
    const err = error as { code?: string; message?: string };
    if (
      err.message?.includes("CANCELED") ||
      err.message?.includes("cancelled") ||
      err.code === "SIGN_IN_CANCELLED"
    ) {
      return { idToken: null, cancelled: true };
    }
    throw error;
  }
}

export async function signOutGoogleNative(): Promise<void> {
  configureGoogleSignIn();
  try {
    await GoogleOneTapSignIn.signOut();
  } catch {
    // Ignore sign-out failures
  }
}
