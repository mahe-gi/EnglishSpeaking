import React from "react";
import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { registerGlobals } from "@livekit/react-native";
import { queryClient } from "../lib/queryClient";

import { AuthProvider } from "../hooks/useAuth";

// Initialize WebRTC and LiveKit native globals once at root module load
registerGlobals();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
