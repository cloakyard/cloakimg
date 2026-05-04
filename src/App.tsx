// App.tsx — Routes the user from the landing page into the editor with
// the document they chose (uploaded image OR blank canvas at a preset
// size). The editor (and Fabric.js with it) is split into a separate
// chunk via `lazy`, so the landing page only ships the bytes it needs;
// Fabric is fetched in the background as soon as the user starts to
// interact, masking the load behind the StartModal.

import { lazy, Suspense, useCallback, useState } from "react";
import { Spinner } from "./editor/atoms";
import { Landing } from "./landing/Landing";
import { rememberRecent } from "./landing/recents";
import { ReloadPrompt } from "./landing/ReloadPrompt";
import { OrientationLock } from "./components/OrientationLock";
import type { StartChoice } from "./landing/StartModal";

const UnifiedEditor = lazy(() =>
  import("./editor/UnifiedEditor").then((m) => ({ default: m.UnifiedEditor })),
);

/** Kick off the editor chunk download as soon as the user signals
 *  intent to enter the editor (opens StartModal, drops a file on the
 *  hero, etc.). The promise is fire-and-forget — the result is
 *  cached by the bundler so React.lazy resolves instantly when the
 *  Suspense boundary renders. */
function preloadEditor() {
  void import("./editor/UnifiedEditor");
}

export function App() {
  const [choice, setChoice] = useState<StartChoice | null>(null);

  const onStart = useCallback((next: StartChoice) => {
    setChoice(next);
    if (next.kind === "upload") void rememberRecent(next.file);
  }, []);

  if (!choice) {
    return (
      <>
        <Landing onStart={onStart} onIntent={preloadEditor} />
        <ReloadPrompt />
        <OrientationLock />
      </>
    );
  }
  return (
    <>
      <Suspense fallback={<EditorLoading />}>
        <UnifiedEditor initialDoc={choice} onExit={() => setChoice(null)} />
      </Suspense>
      <ReloadPrompt />
      <OrientationLock />
    </>
  );
}

function EditorLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-page-bg dark:bg-dark-page-bg">
      <Spinner label="Loading editor…" />
    </div>
  );
}
