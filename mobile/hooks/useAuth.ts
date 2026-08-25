import { useState, useEffect, useCallback, useRef } from "react";
import {
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  GoogleAuthProvider,
  User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { signInWithGoogleNative, signOutGoogleNative } from "../lib/googleAuth";
import { bootstrapUser, User } from "../lib/api";

export type AuthStatus =
  | "idle"
  | "authenticating"
  | "initializingBackend"
  | "authenticated"
  | "error";

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(false);
  const [assessmentCompleted, setAssessmentCompleted] = useState<boolean>(false);
  const [baselineAssessmentId, setBaselineAssessmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const initBackend = useCallback(async (fbUser: FirebaseUser) => {
    try {
      if (isMounted.current) {
        setStatus("initializingBackend");
        setError(null);
      }
      const token = await fbUser.getIdToken();
      const {
        user: appUser,
        onboardingCompleted: isOnboardingDone,
        assessmentCompleted: isAssessmentDone,
        baselineAssessmentId: assessmentId,
      } = await bootstrapUser(token);

      if (isMounted.current) {
        setUser(appUser);
        setOnboardingCompleted(isOnboardingDone);
        setAssessmentCompleted(isAssessmentDone);
        setBaselineAssessmentId(assessmentId);
        setStatus("authenticated");
      }
    } catch (err: unknown) {
      if (isMounted.current) {
        const message = err instanceof Error ? err.message : "Failed to initialize account with server.";
        setError(message);
        setStatus("error");
      }
    }
  }, []);

  // onAuthStateChanged is the single source of truth for session state and calling initBackend
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!isMounted.current) return;

      setFirebaseUser(fbUser);
      if (fbUser) {
        await initBackend(fbUser);
      } else {
        setUser(null);
        setOnboardingCompleted(false);
        setAssessmentCompleted(false);
        setBaselineAssessmentId(null);
        setStatus("idle");
      }
    });

    return () => unsubscribe();
  }, [initBackend]);

  const signIn = useCallback(async () => {
    if (status === "authenticating" || status === "initializingBackend") {
      return; // Prevent duplicate concurrent submissions
    }

    try {
      setStatus("authenticating");
      setError(null);

      const result = await signInWithGoogleNative();

      if (result.cancelled) {
        if (isMounted.current) {
          setStatus("idle");
        }
        return;
      }

      if (!result.idToken) {
        throw new Error("No Google ID token was received from the sign-in provider.");
      }

      const credential = GoogleAuthProvider.credential(result.idToken);
      // Signing in updates Firebase auth state; onAuthStateChanged will handle calling initBackend
      await signInWithCredential(auth, credential);
    } catch (err: unknown) {
      if (isMounted.current) {
        const message = err instanceof Error ? err.message : "Google authentication failed.";
        setError(message);
        setStatus("error");
      }
    }
  }, [status]);

  const retryBackendInit = useCallback(async () => {
    if (firebaseUser) {
      await initBackend(firebaseUser);
    } else {
      await signIn();
    }
  }, [firebaseUser, initBackend, signIn]);

  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
      await signOutGoogleNative();
    } catch {
      // Ignore cleanup error
    } finally {
      if (isMounted.current) {
        setUser(null);
        setFirebaseUser(null);
        setOnboardingCompleted(false);
        setAssessmentCompleted(false);
        setBaselineAssessmentId(null);
        setError(null);
        setStatus("idle");
      }
    }
  }, []);

  return {
    status,
    user,
    firebaseUser,
    onboardingCompleted,
    setOnboardingCompleted,
    assessmentCompleted,
    setAssessmentCompleted,
    baselineAssessmentId,
    error,
    signIn,
    signOut: signOutUser,
    retryBackendInit,
    isLoading: status === "authenticating" || status === "initializingBackend",
    isAuthenticated: status === "authenticated" && user !== null,
  };
}
