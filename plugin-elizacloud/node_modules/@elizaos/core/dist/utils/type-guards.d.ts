/**
 * Type guard utilities for runtime type checking
 * These functions help TypeScript narrow types safely
 */
/**
 * Check if a value is a plain object (not a special object type)
 * Type guard that narrows the type to Record<string, unknown>
 *
 * Excludes: null, arrays, buffers, Date, RegExp, Map, Set, WeakMap, WeakSet, Error, Promise
 *
 * @param value - The value to check
 * @returns True if the value is a plain object
 *
 * @example
 * ```typescript
 * const data: unknown = { name: 'test' };
 * if (isPlainObject(data)) {
 *   // TypeScript knows data is Record<string, unknown>
 *   console.log(data.name);
 * }
 * ```
 */
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
//# sourceMappingURL=type-guards.d.ts.map