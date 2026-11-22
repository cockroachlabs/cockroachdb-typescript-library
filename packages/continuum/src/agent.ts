/** An ops-tool registry with destructive-action gating. */

/** A registered tool implementation. */
export type ToolFunc = (args: unknown) => Promise<unknown> | unknown;

/** Metadata describing a registered tool. */
export interface ToolDescriptor {
  name: string;
  description: string;
  destructive: boolean;
}

/** A registry of ops tools. */
export class Registry {
  private readonly tools = new Map<string, { descriptor: ToolDescriptor; func: ToolFunc }>();

  /** Registers a tool (chainable). */
  register(name: string, description: string, destructive: boolean, func: ToolFunc): this {
    this.tools.set(name, { descriptor: { name, description, destructive }, func });
    return this;
  }

  /** Lists registered tools, sorted by name. */
  list(): ToolDescriptor[] {
    return [...this.tools.values()]
      .map((t) => t.descriptor)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Invokes a non-destructive tool; destructive tools are refused. */
  async invoke(name: string, args: unknown): Promise<unknown> {
    const entry = this.tools.get(name);
    if (!entry) throw new Error(`unknown tool: ${name}`);
    if (entry.descriptor.destructive) {
      throw new Error(`tool \`${name}\` is destructive; use invokeAllowingDestructive`);
    }
    return entry.func(args);
  }

  /** Invokes any tool, including destructive ones. */
  async invokeAllowingDestructive(name: string, args: unknown): Promise<unknown> {
    const entry = this.tools.get(name);
    if (!entry) throw new Error(`unknown tool: ${name}`);
    return entry.func(args);
  }
}
