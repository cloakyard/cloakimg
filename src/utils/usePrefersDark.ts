import { useEffect, useState } from "react";

const QUERY = "(prefers-color-scheme: dark)";

// Subscribes to the OS color-scheme media query that drives the rest
// of the app's dark mode (tokens.css:14 registers Tailwind's `dark`
// variant against the same query). Returns true when the OS reports
// a dark preference; updates live when the user toggles their system
// theme without reloading.
export function usePrefersDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDark;
}
