import { useSyncExternalStore } from "react";

// Hash routes (#/segments?dimension=country), so the static demo works on GitHub Pages without
// a server rewriting paths, and every view can be linked from the README.

export type Route = { path: string; params: URLSearchParams };

function read(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

function subscribe(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, read);
  const [path, query = ""] = hash.split("?");
  return { path, params: new URLSearchParams(query) };
}

export function href(path: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return `#${path}${query ? `?${query}` : ""}`;
}

/** Change one query parameter without adding a history entry for every toggle. */
export function setParam(name: string, value: string | null) {
  const [path, query = ""] = read().split("?");
  const params = new URLSearchParams(query);
  if (value == null) params.delete(name);
  else params.set(name, value);
  const next = href(path, Object.fromEntries(params));
  window.history.replaceState(null, "", next);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
