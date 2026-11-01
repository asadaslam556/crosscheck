import { useCallback, useEffect, useState } from "react";

import type { components } from "./api-types";

export type Schemas = components["schemas"];
export type Params = Record<string, string | undefined>;

// The hosted demo has no server: it reads JSON exported by backend/scripts/export_snapshot.py.
export const IS_STATIC = import.meta.env.VITE_DATA_MODE === "static";

function clean(params: Params): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] != null),
  );
}

/** Must match snapshot_name() in backend/scripts/export_snapshot.py. */
export function snapshotPath(path: string, params: Params = {}): string {
  const values = clean(params);
  const suffix = Object.keys(values)
    .sort()
    .map((key) => `__${key}-${values[key]}`)
    .join("");
  return `${path}${suffix}.json`;
}

function url(path: string, params: Params): string {
  if (IS_STATIC) return `${import.meta.env.BASE_URL}data/${snapshotPath(path, params)}`;
  const query = new URLSearchParams(clean(params)).toString();
  return `/api/${path}${query ? `?${query}` : ""}`;
}

// The data is fixed for the life of the page, so every response is cached by URL. Switching
// back to a page or a toggle state is instant.
const cache = new Map<string, Promise<unknown>>();

export function fetchJson<T>(path: string, params: Params = {}): Promise<T> {
  const key = url(path, params);
  if (!cache.has(key)) {
    const request = fetch(key).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    });
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key) as Promise<T>;
}

type State<T> = { data?: T; error?: string };

export function useApi<T>(path: string, params: Params = {}) {
  const key = url(path, params);
  const [state, setState] = useState<State<T> & { key?: string }>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchJson<T>(path, params)
      .then((data) => live && setState({ data, key }))
      .catch((error: Error) => live && setState({ error: error.message, key }));
    return () => {
      live = false;
    };
    // `key` already encodes path and params.
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Hide data that belongs to the previous parameters while the new response loads.
  const current = state.key === key ? state : {};
  return { data: current.data, error: current.error, retry };
}
