export const colors = {
  // Base surfaces
  background: "#FAFAFA",
  backgroundSecondary: "#F4F4F5",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#F4F4F5",

  // Text colors
  textPrimary: "#18181B",      // Zinc 900
  textSecondary: "#71717A",    // Zinc 500
  textTertiary: "#A1A1AA",     // Zinc 400
  textInverse: "#FFFFFF",

  // Borders & Dividers
  border: "#E4E4E7",           // Zinc 200
  borderSubtle: "#F4F4F5",     // Zinc 100
  borderStrong: "#D4D4D8",     // Zinc 300

  // Brand / Action
  brand: "#18181B",            // Confident dark ink
  brandPressed: "#27272A",
  brandSubtle: "#F4F4F5",
  accent: "#2563EB",           // Clean blue for active speaking state
  accentSubtle: "#EFF6FF",

  // Semantic Status
  success: "#10B981",          // Emerald 500
  successSubtle: "#ECFDF5",
  warning: "#F59E0B",          // Amber 500
  warningSubtle: "#FFFBEB",
  danger: "#EF4444",           // Red 500
  dangerSubtle: "#FEF2F2",
  dangerPressed: "#DC2626",

  // Voice/Live states
  voiceListening: "#10B981",
  voiceThinking: "#6366F1",
  voiceSpeaking: "#2563EB",
  voiceMuted: "#EF4444",
} as const;

export type ColorToken = keyof typeof colors;
