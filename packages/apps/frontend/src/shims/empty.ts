// Empty stub for Node built-ins that legacy server-side modules import via
// the bundle graph. Any code that actually calls these functions in the
// browser will throw at runtime; the SPA never reaches those paths because
// the surrounding code is server-only and gated by checks like
// `typeof window === "undefined"`. Aliased in vite.config.ts.

const stub: unknown = new Proxy(() => {}, {
  get() {
    return stub;
  },
  apply() {
    throw new Error(
      "node built-in stub called in browser bundle — this path is server-only and should not run client-side",
    );
  },
  construct() {
    throw new Error("node built-in stub instantiated in browser bundle — this path is server-only");
  },
});

// CJS / ESM compatibility: a default export plus all named exports that any
// of the targeted node modules export are proxied to the same trap object.
export default stub;
export const networkInterfaces = stub;
export const promises = stub;
export const constants = stub;
export const createServer = stub;
export const createConnection = stub;
export const createCipheriv = stub;
export const createDecipheriv = stub;
export const createHash = stub;
export const createHmac = stub;
export const createSign = stub;
export const createVerify = stub;
export const randomBytes = stub;
export const randomUUID = stub;
export const pbkdf2 = stub;
export const pbkdf2Sync = stub;
export const scrypt = stub;
export const scryptSync = stub;
export const subtle = stub;
export const webcrypto = stub;
export const readFile = stub;
export const readFileSync = stub;
export const writeFile = stub;
export const writeFileSync = stub;
export const existsSync = stub;
export const statSync = stub;
export const readdirSync = stub;
export const join = stub;
export const resolve = stub;
export const dirname = stub;
export const basename = stub;
export const extname = stub;
export const sep = "/";
export const Readable = stub;
export const Writable = stub;
export const Transform = stub;
export const Duplex = stub;
export const PassThrough = stub;
export const pipeline = stub;
export const finished = stub;
export const Buffer = stub;
export const tmpdir = () => "/tmp";
export const homedir = () => "/";
export const platform = () => "browser";
export const arch = () => "x64";
export const cpus = () => [];
export const totalmem = () => 0;
export const freemem = () => 0;
export const hostname = () => "localhost";
export const release = () => "0";
export const type = () => "Browser";
export const userInfo = () => ({ username: "", uid: 0, gid: 0, shell: "", homedir: "/" });
export const get = stub;
export const request = stub;
export const Agent = stub;
export const STATUS_CODES = {};
export const METHODS = [];

// EventEmitter must be a real class (libraries do `extends EventEmitter`).
export class EventEmitter {
  private _listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  on(event: string, fn: (...args: unknown[]) => void) {
    (this._listeners[event] ||= []).push(fn);
    return this;
  }
  off(event: string, fn: (...args: unknown[]) => void) {
    this._listeners[event] = (this._listeners[event] || []).filter((f) => f !== fn);
    return this;
  }
  once(event: string, fn: (...args: unknown[]) => void) {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper);
      fn(...args);
    };
    return this.on(event, wrapper);
  }
  emit(event: string, ...args: unknown[]) {
    for (const fn of this._listeners[event] || []) fn(...args);
    return (this._listeners[event] || []).length > 0;
  }
  removeAllListeners(event?: string) {
    if (event) delete this._listeners[event];
    else this._listeners = {};
    return this;
  }
  addListener(event: string, fn: (...args: unknown[]) => void) {
    return this.on(event, fn);
  }
  removeListener(event: string, fn: (...args: unknown[]) => void) {
    return this.off(event, fn);
  }
  listeners(event: string) {
    return [...(this._listeners[event] || [])];
  }
  listenerCount(event: string) {
    return (this._listeners[event] || []).length;
  }
  setMaxListeners() {
    return this;
  }
  getMaxListeners() {
    return 10;
  }
  eventNames() {
    return Object.keys(this._listeners);
  }
}
export const captureRejectionSymbol = Symbol("captureRejection");
export const errorMonitor = Symbol("errorMonitor");
export const setMaxListeners = () => {};
export const getEventListeners = () => [];
export const once = () => Promise.resolve([]);
export const on_ = () => ({
  [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true }) }),
});
export const types = {};
export const inspect = (v: unknown) => String(v);
export const format = (v: unknown) => String(v);
export const promisify = (fn: unknown) => fn;
export const callbackify = (fn: unknown) => fn;
export const inherits = () => {};
export const isDeepStrictEqual = () => false;
export const TextDecoder = globalThis.TextDecoder;
export const TextEncoder = globalThis.TextEncoder;
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
export const fileURLToPath = (u: string | { href?: string }) =>
  typeof u === "string" ? u : (u.href ?? "");
export const pathToFileURL = (p: string) => new globalThis.URL(`file://${p}`);
export const channel = () => ({ publish: () => {}, subscribe: () => {}, unsubscribe: () => {} });
export const tracingChannel = channel;
export const lookup = stub;
export const resolve4 = stub;
export const resolve6 = stub;
export const Resolver = class {};
export const SocketAddress = class {};
export const Socket = stub;
export const Server = stub;
