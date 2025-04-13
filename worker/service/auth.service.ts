import { APIError } from "better-auth/api";
import { WaitlistRepo } from "../repo";
import { phClient } from "../lib/posthog";
import { nanoid } from "nanoid";
import { secrets } from "../lib/secrets";
import { EmailService } from ".";

export function serializeEmail(email: string | undefined): string | undefined {
  return email?.toLowerCase().trim();
}

const ADMIN_EMAILS = secrets.ADMIN_EMAIL.split(",").map((email) =>
  email.trim(),
);

export type ProtectSigninResponseCode = "WAITLIST_FOUND" | "WAITLIST_CREATED";

export async function protectSignIn(email: string | undefined) {
  if (!email) {
    throw new APIError("BAD_REQUEST", {
      message: "Email is required",
    });
  }

  // Admin - it's ok
  if (ADMIN_EMAILS.includes(email)) {
    return;
  }

  const isInWaitlist = await WaitlistRepo.get(email);
  if (isInWaitlist) {
    phClient.capture({
      distinctId: nanoid(),
      event: "waitlist found",
      properties: {
        email: email,
        $process_person_profile: false,
      },
    });

    throw new APIError("OK", {
      code: "WAITLIST_FOUND" satisfies ProtectSigninResponseCode,
      message:
        "You are on the waitlist. We will notify you when registration is open.",
    });
  }

  // Add to waitlist
  try {
    await WaitlistRepo.create(email);
  } catch (error) {
    console.error("Error adding email to waitlist:", error);
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "Failed to add email to waitlist",
    });
  }

  phClient.capture({
    distinctId: nanoid(),
    event: "waitlist created",
    properties: {
      email: email,
      $process_person_profile: false,
    },
  });
  await EmailService.sendWaitlistWelcome({ email });

  throw new APIError("OK", {
    code: "WAITLIST_CREATED" satisfies ProtectSigninResponseCode,
    message: "Your email has been added to the waitlist",
  });
}
