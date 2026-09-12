export class ClientApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    throw new ClientApiError(
      offline
        ? "You're offline. Reconnect to sync with the guild."
        : "The guild didn't answer. Check your connection and try again.",
      0,
    );
  }

  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.assign("/login");
    }
    throw new ClientApiError(
      (data && "error" in data && data.error) || `Request failed (${res.status})`,
      res.status,
    );
  }
  return data as T;
}
