export function requireEnv(
  value: string | undefined,
  name: string
): string {
  if (!value?.trim()) {
    throw new Error(
      `[Configuration] Missing required environment variable: ${name}`
    );
  }

  return value.trim();
}
