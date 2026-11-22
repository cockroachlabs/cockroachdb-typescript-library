/** Transaction isolation levels. */
export type IsolationLevel = 'serializable' | 'read committed';

/** The default: `serializable`. */
export const DEFAULT_ISOLATION: IsolationLevel = 'serializable';

/** The SQL spelling for `SET TRANSACTION ISOLATION LEVEL ...`. */
export function isolationSql(level: IsolationLevel): string {
  return level === 'serializable' ? 'SERIALIZABLE' : 'READ COMMITTED';
}
