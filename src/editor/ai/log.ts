// log.ts — Tiny structured-logging shim for the AI surface.
//
// Goals:
//   • Every error path in the AI flow funnels through aiLog.error so
//     the browser console shows a consistent `[ai] <subsystem> …` shape.
//     A future "send error to a sink" step (Sentry, OpenTelemetry, etc.)
//     plugs in here without touching call sites.
//   • Lifecycle events (worker spawn, model fetch start/finish, mask
//     state transitions) emit at debug level. Most builds drop them in
//     production via the `enabled` gate; dev keeps them on so a user
//     can paste a console snapshot when reporting a bug.
//   • Adds a stable `subsystem` tag so a Cmd+F filter on `[ai] runtime`
//     vs `[ai] subjectMask` separates concerns cleanly.
//
// Why a shim and not console.* directly:
//   • Browser console is the only real telemetry CloakIMG has — the app
//     is privacy-first and never phones home. Centralising the prefix +
//     log level + extra-field shape means we can later add
//     `localStorage.setItem('ai_debug', '1')` to opt into verbose logs
//     without scattering env checks across call sites.
//   • Errors thrown from a Web Worker only surface as MessageEvents.
//     Routing both worker-side and main-thread errors through the same
//     log helper keeps stack traces and context together.

type Subsystem = "runtime" | "worker" | "segment" | "subjectMask" | "consent" | "preview" | "panel";

interface LogContext {
  /** Optional structured fields appended after the message. Logged via
   *  console with the object spread so DevTools can expand them. */
  [key: string]: unknown;
}

/** Toggle verbose logs at runtime. `localStorage.ai_debug = "1"` to
 *  enable a verbose trace (Cmd+F by `[ai]` to filter). The check is
 *  guarded with a try/catch because Safari throws on localStorage
 *  access in cross-site iframes / private mode. */
function debugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("ai_debug") === "1";
  } catch {
    return false;
  }
}

function tag(sub: Subsystem): string {
  return `[ai] ${sub}`;
}

export const aiLog = {
  /** Lifecycle event — only emitted when `localStorage.ai_debug = "1"`. */
  debug(sub: Subsystem, message: string, ctx?: LogContext) {
    if (!debugEnabled()) return;
    if (ctx) console.debug(tag(sub), message, ctx);
    else console.debug(tag(sub), message);
  },

  /** Important state transition — emitted at info level so it survives
   *  most production console filters but doesn't clutter on its own. */
  info(sub: Subsystem, message: string, ctx?: LogContext) {
    if (ctx) console.info(tag(sub), message, ctx);
    else console.info(tag(sub), message);
  },

  /** Recoverable issue (network blip, retry, fallback path taken). */
  warn(sub: Subsystem, message: string, ctx?: LogContext) {
    if (ctx) console.warn(tag(sub), message, ctx);
    else console.warn(tag(sub), message);
  },

  /** Hard failure — the user-visible error chip will surface a friendly
   *  variant of `message`, but the detailed `err` lands in the console
   *  for bug-report capture. Always pass the original Error so its
   *  stack is preserved. */
  error(sub: Subsystem, message: string, err: unknown, ctx?: LogContext) {
    const fields: LogContext = { ...ctx };
    if (err instanceof Error) {
      fields.errorName = err.name;
      fields.errorMessage = err.message;
      if (err.stack) fields.stack = err.stack;
    } else if (err !== undefined) {
      fields.error = err;
    }
    console.error(tag(sub), message, fields);
  },
};
