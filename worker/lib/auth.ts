import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema/auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import { env } from "cloudflare:workers";
import { emailOTP } from "better-auth/plugins";
import { Resend } from "resend";

const resend = new Resend(env.RESEND_API_KEY);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: schema,
  }),

  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") {
          throw new APIError("BAD_REQUEST", {
            message: "Only sign-in requests are supported",
          });
        }

        const subject = "Your login code for Manotes";
        const messageText = `Your verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.\n\nThanks,\nManotes Team`;
        const messageHtml = `<p>Your verification code is: <strong>${otp}</strong></p>\n<p>This code will expire in 10 minutes.</p>\n<p>If you didn't request this code, you can safely ignore this email.</p>\n<p>Thanks,<br>Manotes Team</p>`;

        await resend.emails.send({
          from: "Manotes <no-reply@manotes.dev>",
          to: [email],
          subject: subject,
          text: messageText,
          html: messageHtml,
        });
      },
    }),
  ],
  trustedOrigins: [process.env.CORS_ORIGIN || ""],
  emailAndPassword: {
    enabled: false,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // TODO: must reimplement this
      if (ctx.path !== "/email-otp/send-verification-otp") {
        return;
      }
      const adminEmails = env.ADMIN_EMAIL.split(",").map((email) =>
        email.trim(),
      );
      if (!adminEmails.includes(ctx.body?.email)) {
        throw new APIError("BAD_REQUEST", {
          message: "Sorry, registration is restricted for now.",
        });
      }
    }),
  },
});
