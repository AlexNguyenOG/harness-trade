import {
  type AuthFn,
  UnauthenticatedError,
  withAuthChallenges,
} from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { isLiveAgentEnabled } from "../lib/live-access-store";
import { verifyPrivyToken } from "../lib/privy-auth";

function requestMode(
  request: Request,
  name: string,
  allowed: readonly string[],
  fallback: string,
): string {
  const value = request.headers.get(name)?.trim().toLowerCase() ?? "";
  return allowed.includes(value) ? value : fallback;
}

const privyAuth: AuthFn<Request> = withAuthChallenges(
  async (request) => {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7).trim()
      : "";
    if (!token) {
      throw new UnauthenticatedError({
        code: "privy_token_required",
        message: "Sign in with Privy to use the agent.",
      });
    }
    const userId = await verifyPrivyToken(token);
    if (!userId) {
      throw new UnauthenticatedError({
        code: "privy_token_invalid",
        message: "The Privy session is invalid or expired.",
      });
    }

    const requestedAccount = requestMode(
      request,
      "x-harness-account-mode",
      ["paper", "live"],
      "paper",
    );
    // Live is never taken from the client header alone — require a durable
    // server-side enablement record (fail closed to paper).
    const liveEnabled =
      requestedAccount === "live" ? await isLiveAgentEnabled(userId) : false;
    const accountMode = liveEnabled ? "live" : "paper";

    return {
      authenticator: "privy",
      issuer: "privy.io",
      principalId: userId,
      principalType: "user",
      subject: userId,
      attributes: {
        agentMode: requestMode(
          request,
          "x-harness-agent-mode",
          ["observe", "ask", "auto"],
          "ask",
        ),
        accountMode,
        liveAccess: liveEnabled ? "true" : "false",
        paused:
          request.headers.get("x-harness-agent-paused") === "true"
            ? "true"
            : "false",
        llmProfileId: (() => {
          const value =
            request.headers.get("x-harness-llm-profile")?.trim() ?? "";
          if (value === "platform") return "platform";
          return /^[0-9a-f]{32}$/i.test(value) ? value : "";
        })(),
      },
    };
  },
  [{ scheme: "Bearer" }],
);

export default eveChannel({ auth: [privyAuth] });
