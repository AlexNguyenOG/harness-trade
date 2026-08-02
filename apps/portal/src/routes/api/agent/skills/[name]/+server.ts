import { json } from "@sveltejs/kit";
import { SkillFormatException } from "$agent/lib/skill-format";
import { isSkillStoreConfigured, skillStore } from "$agent/lib/skill-store";
import { requireAgentUser } from "$lib/server/agent-api";
import type { RequestHandler } from "./$types";

export const PATCH: RequestHandler = async ({
  request,
  params,
  setHeaders,
}) => {
  setHeaders({ "cache-control": "no-store" });
  const user = await requireAgentUser(request);
  if (user instanceof Response) return user;
  if (!isSkillStoreConfigured()) {
    return json({ error: "skill-store-unconfigured" }, { status: 503 });
  }

  const name = params.name?.trim() ?? "";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid-body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return json({ error: "invalid-body" }, { status: 400 });
  }
  const enabled = (body as { enabled?: unknown }).enabled;
  if (typeof enabled !== "boolean") {
    return json({ error: "invalid-body" }, { status: 400 });
  }

  try {
    const skill = await skillStore.setEnabled(user, name, enabled);
    return json({
      skill: {
        ...skillStore.summarize([skill])[0],
        source: "user",
        format: "agentskills",
        loadSkillId: `user-${skill.name}`,
      },
    });
  } catch (error: unknown) {
    if (error instanceof SkillFormatException) {
      return json({ error: error.code }, { status: 400 });
    }
    if (
      error instanceof Error &&
      error.message === "agent-state-object-not-found"
    ) {
      return json({ error: "skill-not-found" }, { status: 404 });
    }
    return json({ error: "skill-store-unavailable" }, { status: 503 });
  }
};

export const DELETE: RequestHandler = async ({
  request,
  params,
  setHeaders,
}) => {
  setHeaders({ "cache-control": "no-store" });
  const user = await requireAgentUser(request);
  if (user instanceof Response) return user;
  if (!isSkillStoreConfigured()) {
    return json({ error: "skill-store-unconfigured" }, { status: 503 });
  }

  const name = params.name?.trim() ?? "";
  try {
    const removed = await skillStore.remove(user, name);
    if (!removed) return json({ error: "skill-not-found" }, { status: 404 });
    return json({ ok: true, name });
  } catch (error: unknown) {
    if (error instanceof SkillFormatException) {
      return json({ error: error.code }, { status: 400 });
    }
    return json({ error: "skill-store-unavailable" }, { status: 503 });
  }
};
