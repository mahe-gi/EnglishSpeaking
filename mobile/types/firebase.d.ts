/**
 * TypeScript declaration augmentation for Firebase JS SDK in React Native.
 *
 * Reason:
 * The Firebase JS SDK package.json declares default TypeScript types (dist/auth-public.d.ts)
 * targeting web/browser runtimes, which omit `getReactNativePersistence`.
 * At runtime, the React Native export condition resolves to `dist/rn/index.js` where
 * `getReactNativePersistence` is exported. This declaration provides the missing type signature
 * for TypeScript compilers operating under standard moduleResolution without react-native conditions.
 */
import { Persistence } from "firebase/auth";

declare module "firebase/auth" {
  export function getReactNativePersistence(storage: unknown): Persistence;
}

declare module "@firebase/auth" {
  export function getReactNativePersistence(storage: unknown): Persistence;
}
