import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
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

export interface AuthContextType {
  status: AuthStatus;
  user: User | null;
  firebaseUser: FirebaseUser | null;
  onboardingCompleted: boolean;
  setOnboardingCompleted: (val: boolean) => void;
  assessmentCompleted: boolean;
  setAssessmentCompleted: (val: boolean) => void;
  baselineAssessmentId: string | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  retryBackendInit: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
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
      console.log("[AuthTrace] 4. initBackend started. Fetching Firebase ID token...");
      const token = await fbUser.getIdToken();
      console.log("[AuthTrace] 5. Firebase ID token obtained. Calling PUT /api/v1/me...");
      const {
        user: appUser,
        onboardingCompleted: isOnboardingDone,
        assessmentCompleted: isAssessmentDone,
        baselineAssessmentId: assessmentId,
      } = await bootstrapUser(token);

      console.log("[AuthTrace] 6. PUT /api/v1/me SUCCESS:", JSON.stringify({
        hasUser: !!appUser,
        onboardingCompleted: isOnboardingDone,
        assessmentCompleted: isAssessmentDone,
        hasAssessmentId: !!assessmentId,
      }));

      if (isMounted.current) {
        setUser(appUser);
        setOnboardingCompleted(isOnboardingDone);
        setAssessmentCompleted(isAssessmentDone);
        setBaselineAssessmentId(assessmentId);
        setStatus("authenticated");
      }
    } catch (err: unknown) {
      console.error("[AuthTrace] ❌ initBackend error:", err);
      if (isMounted.current) {
        const message =
          err instanceof Error ? err.message : "Failed to initialize account with server.";
        setError(message);
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      console.log("[AuthTrace] onAuthStateChanged fired. Has Firebase user:", !!fbUser);
      if (fbUser) {
        setFirebaseUser(fbUser);
        initBackend(fbUser);
      } else {
        setUser(null);
        setFirebaseUser(null);
        setOnboardingCompleted(false);
        setAssessmentCompleted(false);
        setBaselineAssessmentId(null);
        setError(null);
        setStatus("idle");
      }
    });

    return () => unsubscribe();
  }, [initBackend]);

  const signIn = useCallback(async () => {
    if (status === "authenticating" || status === "initializingBackend") {
      return;
    }

    try {
      setStatus("authenticating");
      setError(null);
      console.log("[AuthTrace] 1. Triggering Google Native Sign-In...");

      const result = await signInWithGoogleNative();
      console.log("[AuthTrace] 2. Google Native Sign-In completed. Cancelled:", !!result.cancelled, "Has idToken:", !!result.idToken);

      if (result.cancelled) {
        if (isMounted.current) {
          setStatus("idle");
        }
        return;
      }

      if (!result.idToken) {
        throw new Error("No Google ID token was received from the sign-in provider.");
      }

      console.log("[AuthTrace] 3. Exchanging Google credential with Firebase...");
      const credential = GoogleAuthProvider.credential(result.idToken);
      const fbCred = await signInWithCredential(auth, credential);
      console.log("[AuthTrace] 3b. Firebase signInWithCredential succeeded. Has user:", !!fbCred.user);
    } catch (err: unknown) {
      console.error("[AuthTrace] ❌ signIn error:", err);
      if (isMounted.current) {
        const message = err instanceof Error ? err.message : "Google authentication failed.";
        setError(message);
        setStatus("error");
      }
    }
  }, [status]);

  const refreshBootstrap = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (currentFbUser) {
      await initBackend(currentFbUser);
    }
  }, [initBackend]);

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

  const value: AuthContextType = {
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
    refreshBootstrap,
    isLoading: status === "authenticating" || status === "initializingBackend",
    isAuthenticated: status === "authenticated" && user !== null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
