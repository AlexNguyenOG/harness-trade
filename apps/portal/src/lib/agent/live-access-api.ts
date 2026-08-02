import { getPrivyAccessToken } from "$lib/privy-auth";

async function authHeaders(): Promise<HeadersInit> {
  const token = await getPrivyAccessToken();
  if (!token) throw new Error("auth-required");
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

export async function fetchLiveAgentAccess(): Promise<{
  enabled: boolean;
  storeConfigured: boolean;
}> {
  const response = await fetch("/api/agent/live-access", {
    headers: await authHeaders(),
  });
  if (!response.ok) throw new Error(`live-access-${response.status}`);
  return (await response.json()) as {
    enabled: boolean;
    storeConfigured: boolean;
  };
}

/** Explicit ack before the agent may run live executions for this user. */
export async function setLiveAgentAccess(enabled: boolean): Promise<void> {
  const response = await fetch("/api/agent/live-access", {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? `live-access-${response.status}`);
  }
}
