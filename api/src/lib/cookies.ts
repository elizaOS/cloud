/**
 * Thin wrapper around `hono/cookie` matching the call shape used in the
 * old Next.js `cookies()` helper, so route conversions are mostly mechanical.
 *
 *   cookies().get(name)?.value           ->   readCookie(c, name)
 *   cookies().set(name, value, options)  ->   writeCookie(c, name, value, options)
 *   cookies().delete(name)               ->   removeCookie(c, name)
 */

import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";

export function readCookie(c: Context, name: string): string | undefined {
  return getCookie(c, name);
}

export function writeCookie(
  c: Context,
  name: string,
  value: string,
  options?: CookieOptions,
): void {
  setCookie(c, name, value, options);
}

export function removeCookie(c: Context, name: string, options?: CookieOptions): void {
  deleteCookie(c, name, options);
}

export function cookiesObject(c: Context): Record<string, string> {
  return getCookie(c) ?? {};
}
