import { describe, expect, it } from 'vitest';
import {
  createAegis,
  createCloud,
  createMcpClient,
  Registry,
  SimulatedCloud,
  VClusterContext,
} from './index.js';

describe('vcluster', () => {
  it('builds QoS + application statements', () => {
    const stmts = new VClusterContext('payroll', 'background').applyStatements();
    expect(stmts[0]).toBe("SET default_transaction_quality_of_service = 'background'");
    expect(stmts[1]).toBe("SET application_name = 'payroll'");
  });

  it('escapes the application name', () => {
    const stmts = new VClusterContext("pay'roll").applyStatements();
    expect(stmts[1]).toBe("SET application_name = 'pay''roll'");
  });
});

describe('simulated clients', () => {
  it('aegis returns findings and records events', async () => {
    const aegis = createAegis();
    expect((await aegis.findings()).length).toBeGreaterThan(0);
    await aegis.emit({ kind: 'circuit_open', detail: 'payments' });
  });

  it('aegis errors when an endpoint is set without http', async () => {
    await expect(createAegis({ endpoint: 'https://x' }).findings()).rejects.toThrow();
  });

  it('mcp lists and calls the echo tool', async () => {
    const mcp = createMcpClient();
    expect((await mcp.listTools())[0]?.name).toBe('echo');
    expect(await mcp.callTool('echo', { hi: 1 })).toContain('"hi"');
    await expect(mcp.callTool('nope', {})).rejects.toThrow();
  });

  it('cloud lists clusters and exports metrics', async () => {
    const cloud = new SimulatedCloud();
    expect((await cloud.listClusters()).length).toBe(1);
    await cloud.exportMetric('tx', 42);
    expect(cloud.exported).toEqual([['tx', 42]]);
    expect((await createCloud({ apiKey: 'k' }).listClusters)).toBeTypeOf('function');
  });
});

describe('agent registry', () => {
  function registry(): Registry {
    return new Registry()
      .register('health', 'Check health', false, () => ({ status: 'up' }))
      .register('drop', 'Drops a table', true, () => ({ dropped: true }));
  }

  it('lists sorted and gates destructive tools', async () => {
    const r = registry();
    expect(r.list().map((d) => d.name)).toEqual(['drop', 'health']);
    expect(await r.invoke('health', {})).toEqual({ status: 'up' });
    await expect(r.invoke('drop', {})).rejects.toThrow(/destructive/);
    expect(await r.invokeAllowingDestructive('drop', {})).toEqual({ dropped: true });
  });
});
