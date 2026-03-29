/**
 * Feature flags derived from environment configuration.
 *
 * OSS mode (default): NEXT_PUBLIC_CLOUD_URL is not set.
 *   - Admin shows: Integrations, Plugins, Health, simplified Dashboard
 *
 * Cloud mode: NEXT_PUBLIC_CLOUD_URL is set.
 *   - Admin shows everything above plus: Users, Activity, Usage/Billing
 */

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

/** True when the dashboard is running as part of the cloud platform. */
export const isCloudMode = !!CLOUD_URL;

/** True when the dashboard is running as a standalone OSS install. */
export const isOSSMode = !CLOUD_URL;

/**
 * Feature availability by deployment mode.
 * All features are available in cloud mode.
 * OSS mode hides multi-tenant/compliance features.
 */
export const features = {
  /** Global user management (invite, roles, RBAC) */
  userManagement: isCloudMode,

  /** System-wide activity audit log */
  activityFeed: isCloudMode,

  /** Usage metrics and billing (cloud tiers) */
  usageBilling: isCloudMode,

  /** SSO / SAML authentication */
  sso: isCloudMode,

  /** Always available in both modes */
  integrations: true,
  plugins: true,
  health: true,
} as const;
