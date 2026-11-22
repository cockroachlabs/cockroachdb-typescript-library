/** Aegis: security findings, recommendations, and app-event emission. */

export interface Finding {
  id: string;
  severity: string;
  title: string;
  detail: string;
}

export interface Recommendation {
  id: string;
  title: string;
  action: string;
}

export interface AppEvent {
  kind: string;
  detail: string;
}

export interface AegisConfig {
  endpoint?: string;
  apiKey?: string;
}

/** The Aegis client surface. */
export interface Aegis {
  findings(): Promise<Finding[]>;
  recommendations(): Promise<Recommendation[]>;
  emit(event: AppEvent): Promise<void>;
}

/** Offline Aegis client with canned data; records emitted events. */
export class SimulatedAegis implements Aegis {
  readonly emitted: AppEvent[] = [];

  async findings(): Promise<Finding[]> {
    return [
      { id: 'AEGIS-001', severity: 'medium', title: 'Insecure connection', detail: 'A connection uses sslmode=disable.' },
    ];
  }

  async recommendations(): Promise<Recommendation[]> {
    return [{ id: 'REC-001', title: 'Require TLS', action: 'Set sslmode=verify-full on all clients.' }];
  }

  async emit(event: AppEvent): Promise<void> {
    this.emitted.push(event);
  }
}

const httpDisabled = (): Error =>
  new Error('continuum HTTP transport is not enabled in this build');

class NotEnabledAegis implements Aegis {
  findings(): Promise<Finding[]> {
    return Promise.reject(httpDisabled());
  }
  recommendations(): Promise<Recommendation[]> {
    return Promise.reject(httpDisabled());
  }
  emit(): Promise<void> {
    return Promise.reject(httpDisabled());
  }
}

/** Builds an Aegis client: simulated when no endpoint is configured. */
export function createAegis(config: AegisConfig = {}): Aegis {
  return config.endpoint ? new NotEnabledAegis() : new SimulatedAegis();
}
