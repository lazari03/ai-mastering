// Account-lifecycle hooks into the MCP integration, safe to call whether or
// not it is enabled (no-ops until bootstrap.js registers it). Lets the
// existing routes (DELETE /account, sign-out-everywhere, admin disable)
// revoke ChatGPT connections without importing the integration itself.
let integration = null;

export function registerMcpIntegration(value) {
  integration = value;
}

export function mcpRevokeUser(uid, reason) {
  try {
    return integration?.revokeUser(uid, reason) ?? 0;
  } catch (error) {
    console.error("MCP: revoking grants failed:", error.message);
    return 0;
  }
}

export function mcpDeleteUserData(uid) {
  try {
    integration?.deleteUserData(uid);
  } catch (error) {
    console.error("MCP: deleting user data failed:", error.message);
  }
}
