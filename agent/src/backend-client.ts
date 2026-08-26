export interface BackendClientOptions {
  backendUrl: string;
  internalSecret: string;
}

export class BackendClient {
  private backendUrl: string;
  private internalSecret: string;

  constructor(options: BackendClientOptions) {
    this.backendUrl = options.backendUrl.replace(/\/+$/, "");
    this.internalSecret = options.internalSecret;
  }

  async markActive(sessionId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.backendUrl}/internal/voice-sessions/${sessionId}/active`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.internalSecret}`,
        },
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        console.error(`[BackendClient] Failed to mark session ${sessionId} active: HTTP ${res.status}`);
        return false;
      }

      console.log(`[BackendClient] Session ${sessionId} marked ACTIVE on backend.`);
      return true;
    } catch (err) {
      console.error(`[BackendClient] Network error marking session ${sessionId} active:`, err);
      return false;
    }
  }

  async markComplete(
    sessionId: string,
    outcome: "COMPLETED" | "CANCELLED" | "FAILED" = "COMPLETED"
  ): Promise<boolean> {
    try {
      const res = await fetch(`${this.backendUrl}/internal/voice-sessions/${sessionId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.internalSecret}`,
        },
        body: JSON.stringify({ outcome }),
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        console.error(`[BackendClient] Failed to mark session ${sessionId} complete: HTTP ${res.status}`);
        return false;
      }

      console.log(`[BackendClient] Session ${sessionId} marked ${outcome} on backend.`);
      return true;
    } catch (err) {
      console.error(`[BackendClient] Network error marking session ${sessionId} complete:`, err);
      return false;
    }
  }
}
