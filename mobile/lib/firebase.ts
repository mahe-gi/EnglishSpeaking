import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  Auth,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireEnv } from "./env";

const firebaseConfig = {
  apiKey: requireEnv(
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    "EXPO_PUBLIC_FIREBASE_API_KEY"
  ),
  authDomain: requireEnv(
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"
  ),
  projectId: requireEnv(
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID"
  ),
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined,
  appId: requireEnv(
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    "EXPO_PUBLIC_FIREBASE_APP_ID"
  ),
};

function getFirebaseApp(): FirebaseApp {
  const apps = getApps();
  if (apps.length > 0 && apps[0]) {
    return apps[0];
  }
  return initializeApp(firebaseConfig);
}

export const app = getFirebaseApp();

function getFirebaseAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = getFirebaseAuth();
