export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    fontWeight: "600" as const,
  },
  titleLarge: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    fontWeight: "600" as const,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
    fontWeight: "600" as const,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    fontWeight: "500" as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
    fontWeight: "400" as const,
  },
  bodyMedium: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: -0.1,
    fontWeight: "500" as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
    fontWeight: "400" as const,
  },
  captionMedium: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
    fontWeight: "500" as const,
  },
  micro: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.2,
    fontWeight: "600" as const,
  },
} as const;

export type TypographyVariant = keyof typeof typography;
