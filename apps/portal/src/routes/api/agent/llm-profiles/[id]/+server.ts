import { json } from "@sveltejs/kit";
import { isLlmProviderId, type LlmProviderId } from "$agent/lib/llm-catalog";
import {
  isLlmProfileStoreConfigured,
  llmProfileStore,
} from "$agent/lib/llm-profile-store";
import { verifyPrivyAccessToken } from "$lib/server/privy";
import type { RequestHandler } from "./$types";

async function requireUser(request: Request): Promise<string | Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token) return json({ error: "auth-required" }, { status: 401 });
  const userId = await verifyPrivyAccessToken(token);
  if (!userId) return json({ error: "auth-invalid" }, { status: 401 });
  return userId;
}

export const PATCH: RequestHandler = async ({
  request,
  params,
  setHeaders,
}) => {
  setHeaders({ "cache-control": "no-store" });
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  if (!isLlmProfileStoreConfigured()) {
    return json({ error: "llm-store-unconfigured" }, { status: 503 });
  }

  const id = params.id?.trim() ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid-body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return json({ error: "invalid-body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const patch: {
    name?: string;
    provider?: LlmProviderId;
    model?: string;
    apiKey?: string;
    active?: boolean;
  } = {};
  if (typeof record.name === "string") patch.name = record.name;
  if (typeof record.provider === "string" && isLlmProviderId(record.provider)) {
    patch.provider = record.provider;
  }
  if (typeof record.model === "string") patch.model = record.model;
  if (typeof record.apiKey === "string" && record.apiKey.trim()) {
    patch.apiKey = record.apiKey;
  }
  if (typeof record.active === "boolean") patch.active = record.active;

  try {
    const profile = await llmProfileStore.update(user, id, patch);
    return json({ profile: llmProfileStore.summarize([profile])[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "llm-store-error";
    if (message === "agent-state-object-not-found") {
      return json({ error: "llm-profile-not-found" }, { status: 404 });
    }
    const status = message.startsWith("llm-") ? 400 : 503;
    return json({ error: message }, { status });
  }
};

export const DELETE: RequestHandler = async ({
  request,
  params,
  setHeaders,
}) => {
  setHeaders({ "cache-control": "no-store" });
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  if (!isLlmProfileStoreConfigured()) {
    return json({ error: "llm-store-unconfigured" }, { status: 503 });
  }

  const id = params.id?.trim() ?? "";
  try {
    const removed = await llmProfileStore.remove(user, id);
    if (!removed)
      return json({ error: "llm-profile-not-found" }, { status: 404 });
    return json({ ok: true, id });
  } catch {
    return json({ error: "llm-store-unavailable" }, { status: 503 });
  }
};
