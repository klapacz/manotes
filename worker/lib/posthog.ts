import { PostHog } from "posthog-node";
import { secrets } from "./secrets";

export const phClient = new PostHog(secrets.POSTHOG_KEY, {
  host: secrets.POSTHOG_HOST,
  enableExceptionAutocapture: false,
});
