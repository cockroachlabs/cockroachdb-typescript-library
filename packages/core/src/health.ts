/** Health-check interface and status. */

export type Health = 'up' | 'down';

/** The outcome of a health check. */
export interface HealthStatus {
  status: Health;
  detail?: string;
}

/** A component that can report whether its dependency is reachable. */
export interface HealthChecker {
  /** Resolves when healthy; rejects with the failure otherwise. */
  check(): Promise<void>;
}

/** Runs a checker and maps the result to a {@link HealthStatus}. */
export async function healthStatus(checker: HealthChecker): Promise<HealthStatus> {
  try {
    await checker.check();
    return { status: 'up' };
  } catch (err) {
    return { status: 'down', detail: err instanceof Error ? err.message : String(err) };
  }
}
