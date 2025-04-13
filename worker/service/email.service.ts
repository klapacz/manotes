import { Resend } from "resend";
import { secrets } from "../lib/secrets";

const resend = new Resend(secrets.RESEND_API_KEY);

type SendVerificationOTPOpts = {
  otp: string;
  email: string;
};

export async function sendVerificationOTP({
  otp,
  email,
}: SendVerificationOTPOpts) {
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
}

type SendWaitlistWelcomeOpts = { email: string };

export async function sendWaitlistWelcome({ email }: SendWaitlistWelcomeOpts) {
  const subject = "Welcome to the Manotes waitlist";
  const messageText = `Thanks for joining the Manotes waitlist!\n\nWe'll let you know as soon as we're ready to welcome new users.\n\nBest,\nManotes Team`;
  const messageHtml = `<p>Thanks for joining the Manotes waitlist!</p>\n<p>We'll let you know as soon as we're ready to welcome new users.</p>\n<p>Best,<br>Manotes Team</p>`;

  await resend.emails.send({
    from: "Manotes <no-reply@manotes.dev>",
    to: [email],
    subject: subject,
    text: messageText,
    html: messageHtml,
  });
}
