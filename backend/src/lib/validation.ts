const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidInstallationId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (id.length < 32 || id.length > 40) return false;
  return UUID_REGEX.test(id.trim());
}
