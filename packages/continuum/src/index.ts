/**
 * CockroachDB Continuum support surface.
 *
 * vCluster QoS tagging, Plenum storage summaries, and the Aegis / MCP / Cloud
 * clients (offline-simulated by default; a networked transport is reserved for a
 * future build), plus an ops-tool registry with destructive-action gating.
 */
export * from './vcluster.js';
export * from './plenum.js';
export * from './aegis.js';
export * from './mcp.js';
export * from './cloud.js';
export * from './agent.js';
