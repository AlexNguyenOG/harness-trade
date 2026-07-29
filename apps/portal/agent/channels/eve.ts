import { eveChannel } from "eve/channels/eve";
import {
  UnauthenticatedError,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth";
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
        accountMode: requestMode(
          request,
          "x-harness-account-mode",
          ["paper", "live"],
          "paper",
        ),
        paused:
          request.headers.get("x-harness-agent-paused") === "true"
            ? "true"
            : "false",
      },
    };
  },
  [{ scheme: "Bearer" }],
);

export default eveChannel({ auth: [privyAuth] });
