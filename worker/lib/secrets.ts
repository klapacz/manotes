import { env } from "cloudflare:workers";

export const secrets = {
  ADMIN_EMAIL: env.ADMIN_EMAIL,
  RESEND_API_KEY: env.RESEND_API_KEY,
  POSTHOG_KEY: env.POSTHOG_KEY,
  POSTHOG_HOST: env.POSTHOG_HOST,
};
