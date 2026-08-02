import { json } from "@sveltejs/kit";
import {
  isLiveAccessStoreConfigured,
  isLiveAgentEnabled,
  setLiveAgentEnabled,
} from "$agent/lib/live-access-store";
import { requireAgentUser } from "$lib/server/agent-api";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request, setHeaders }) => {
  setHeaders({ "cache-control": "no-store" });
  const user = await requireAgentUser(request);
  if (user instanceof Response) return user;

  if (!isLiveAccessStoreConfigured()) {
    return json({
      enabled: false,
      storeConfigured: false,
    });
  }

  try {
    const enabled = await isLiveAgentEnabled(user);
    return json({ enabled, storeConfigured: true });
  } catch {
    return json({ error: "live-access-unavailable" }, { status: 503 });
  }
};

export const PUT: RequestHandler = async ({ request, setHeaders }) => {
  setHeaders({ "cache-control": "no-store" });
  const user = await requireAgentUser(request);
  if (user instanceof Response) return user;

  if (!isLiveAccessStoreConfigured()) {
    return json({ error: "live-access-store-unconfigured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid-body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return json({ error: "invalid-body" }, { status: 400 });
  }
  const enabled = (body as Record<string, unknown>).enabled;
  if (typeof enabled !== "boolean") {
    return json({ error: "live-access-enabled-invalid" }, { status: 400 });
  }

  try {
    const record = await setLiveAgentEnabled(user, enabled);
    return json({
      enabled: record.enabled,
      updatedAt: record.updatedAt,
      storeConfigured: true,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "live-access-store-error";
    return json({ error: message }, { status: 503 });
  }
};
