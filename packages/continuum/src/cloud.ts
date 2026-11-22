/** CockroachDB Cloud API client: list clusters and export metrics. */

export interface Cluster {
  id: string;
  name: string;
  state: string;
}

export interface CloudConfig {
  apiKey?: string;
  endpoint?: string;
}

/** The Cloud client surface. */
export interface Cloud {
  listClusters(): Promise<Cluster[]>;
  getCluster(id: string): Promise<Cluster>;
  exportMetric(name: string, value: number): Promise<void>;
}

/** Offline Cloud client with one canned cluster; records exported metrics. */
export class SimulatedCloud implements Cloud {
  readonly exported: Array<[string, number]> = [];

  private static sample(): Cluster {
    return { id: 'sim-cluster-1', name: 'simulated', state: 'CREATED' };
  }

  async listClusters(): Promise<Cluster[]> {
    return [SimulatedCloud.sample()];
  }

  async getCluster(id: string): Promise<Cluster> {
    return { ...SimulatedCloud.sample(), id };
  }

  async exportMetric(name: string, value: number): Promise<void> {
    this.exported.push([name, value]);
  }
}

const httpDisabled = (): Error =>
  new Error('continuum HTTP transport is not enabled in this build');

class NotEnabledCloud implements Cloud {
  listClusters(): Promise<Cluster[]> {
    return Promise.reject(httpDisabled());
  }
  getCluster(): Promise<Cluster> {
    return Promise.reject(httpDisabled());
  }
  exportMetric(): Promise<void> {
    return Promise.reject(httpDisabled());
  }
}

/** Builds a Cloud client: simulated when no API key is configured. */
export function createCloud(config: CloudConfig = {}): Cloud {
  return config.apiKey ? new NotEnabledCloud() : new SimulatedCloud();
}
