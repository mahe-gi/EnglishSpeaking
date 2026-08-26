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
  signInAnonymously,
  linkWithCredential,
  signOut,
  GoogleAuthProvider,
  User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { signInWithGoogleNative, signOutGoogleNative } from "../lib/googleAuth";
import { getInstallationId } from "../lib/installation";
import {
  bootstrapUser,
  confirmPeerAge as apiConfirmPeerAge,
  createMergeIntent,
  completeMerge,
  User,
  UserEntitlements,
  ProductState,
  Profile,
} from "../lib/api";

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
  entitlements: UserEntitlements | null;
  productState: ProductState;
  profile: Profile | null;
  speakingCheckCompleted: boolean;
  baselineAssessmentId: string | null;
  isAnonymous: boolean;
  isAgeConfirmed: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  confirmAge: () => Promise<boolean>;
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
  const [entitlements, setEntitlements] = useState<UserEntitlements | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [speakingCheckCompleted, setSpeakingCheckCompleted] = useState<boolean>(false);
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
      const installationId = await getInstallationId();
      console.log("[AuthTrace] 📱 installationId:", installationId, "UID:", fbUser.uid);
      const token = await fbUser.getIdToken();

      const data = await bootstrapUser(token, installationId);

      if (isMounted.current) {
        setUser(data.user);
        setEntitlements(data.entitlements);
        setProfile(data.profile);
        setSpeakingCheckCompleted(data.speakingCheckCompleted);
        setBaselineAssessmentId(data.baselineAssessmentId);
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
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        initBackend(fbUser);
      } else {
        // Value-First: Silently bootstrap anonymous Firebase account on first launch or after sign-out
        try {
          console.log("[AuthTrace] Silently starting anonymous Firebase session...");
          await signInAnonymously(auth);
        } catch (anonErr) {
          console.error("[AuthTrace] Anonymous sign-in failed:", anonErr);
          if (isMounted.current) {
            setUser(null);
            setFirebaseUser(null);
            setEntitlements(null);
            setProfile(null);
            setError("Could not connect to guest service. Please check your network.");
            setStatus("error");
          }
        }
      }
    });

    return () => unsubscribe();
  }, [initBackend]);

  const signInWithGoogle = useCallback(async () => {
    if (status === "authenticating" || status === "initializingBackend") {
      return;
    }

    try {
      setStatus("authenticating");
      setError(null);

      const installationId = await getInstallationId();
      const currentFbUser = auth.currentUser;
      const wasAnonymous = currentFbUser?.isAnonymous;

      let mergeIntentId: string | null = null;
      if (wasAnonymous && currentFbUser) {
        try {
          const token = await currentFbUser.getIdToken();
          const intentRes = await createMergeIntent(token, installationId);
          mergeIntentId = intentRes.mergeIntentId;
        } catch (intentErr) {
          console.warn("[AuthTrace] Failed to create merge intent:", intentErr);
        }
      }

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

      if (wasAnonymous && currentFbUser) {
        try {
          // Case A: Link directly to current anonymous account
          await linkWithCredential(currentFbUser, credential);
        } catch (linkErr: unknown) {
          const errObj = linkErr as { code?: string; message?: string };
          if (
            errObj.code === "auth/credential-already-in-use" ||
            errObj.message?.includes("already-in-use")
          ) {
            // Case B: Existing Google account collision
            const fbCred = await signInWithCredential(auth, credential);
            if (mergeIntentId) {
              try {
                const targetToken = await fbCred.user.getIdToken();
                await completeMerge(targetToken, mergeIntentId, installationId);
              } catch (mergeErr) {
                console.warn("[AuthTrace] completeMerge warning:", mergeErr);
              }
            }
          } else {
            throw linkErr;
          }
        }
      } else {
        await signInWithCredential(auth, credential);
      }
    } catch (err: unknown) {
      console.error("[AuthTrace] ❌ Google Sign-In error:", err);
      if (isMounted.current) {
        const message = err instanceof Error ? err.message : "Google authentication failed.";
        setError(message);
        setStatus("error");
      }
    }
  }, [status]);

  const confirmAge = useCallback(async (): Promise<boolean> => {
    const currentFbUser = auth.currentUser;
    if (!currentFbUser) return false;
    try {
      const token = await currentFbUser.getIdToken();
      await apiConfirmPeerAge(token);
      await initBackend(currentFbUser);
      return true;
    } catch (err) {
      console.error("[AuthTrace] Age confirmation error:", err);
      return false;
    }
  }, [initBackend]);

  const refreshBootstrap = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (currentFbUser) {
      await initBackend(currentFbUser);
    }
  }, [initBackend]);

  const retryBackendInit = useCallback(async () => {
    const currentFbUser = auth.currentUser;
    if (currentFbUser) {
      await initBackend(currentFbUser);
    } else {
      try {
        if (isMounted.current) {
          setStatus("authenticating");
          setError(null);
        }
        await signInAnonymously(auth);
      } catch (err: unknown) {
        console.error("[AuthTrace] Anonymous sign-in retry failed:", err);
        if (isMounted.current) {
          const message =
            err instanceof Error ? err.message : "Could not connect to guest service. Please check your network.";
          setError(message);
          setStatus("error");
        }
      }
    }
  }, [initBackend]);

  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
      await signOutGoogleNative();
      // Value-First: Automatically re-boot into clean anonymous session with same installationId
      await signInAnonymously(auth);
    } catch (err) {
      console.warn("[AuthTrace] Sign out cleanup error:", err);
    }
  }, []);

  const isAnonymous = user?.identityType === "ANONYMOUS" || !!firebaseUser?.isAnonymous;
  const productState: ProductState = entitlements?.productState || (isAnonymous ? "GUEST" : "FREE");
  const isAgeConfirmed = !!user?.peerAgeConfirmedAt;

  const value: AuthContextType = {
    status,
    user,
    firebaseUser,
    entitlements,
    productState,
    profile,
    speakingCheckCompleted,
    baselineAssessmentId,
    isAnonymous,
    isAgeConfirmed,
    error,
    signInWithGoogle,
    signOut: signOutUser,
    confirmAge,
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

