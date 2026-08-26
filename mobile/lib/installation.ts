import AsyncStorage from "@react-native-async-storage/async-storage";

const INSTALLATION_KEY = "@ntalo_installation_id";

function generateUUID(): string {
  // RFC4122 compliant UUID v4 generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedInstallationId: string | null = null;

export async function getInstallationId(): Promise<string> {
  if (cachedInstallationId) {
    return cachedInstallationId;
  }

  try {
    const stored = await AsyncStorage.getItem(INSTALLATION_KEY);
    if (stored && stored.length >= 10) {
      cachedInstallationId = stored;
      return stored;
    }

    const newId = generateUUID();
    await AsyncStorage.setItem(INSTALLATION_KEY, newId);
    cachedInstallationId = newId;
    return newId;
  } catch (error) {
    if (__DEV__) {
      console.warn("[Installation] Failed to load/save installationId:", error);
    }
    const fallbackId = generateUUID();
    cachedInstallationId = fallbackId;
    return fallbackId;
  }
}
