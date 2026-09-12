import * as Cloudflare from "alchemy/Cloudflare";
import { Config, Context, Effect, Layer } from "effect";
import * as Errors from "./errors.ts";

export type EmailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

export class EmailService extends Context.Service<EmailService>()("Auth.EmailService", {
  make: Effect.gen(function* () {
    const EMAIL_ADDRESS = yield* Config.nonEmptyString("EMAIL_ADDRESS");
    const IS_DEV = yield* Config.boolean("IS_DEV");

    const Email = yield* Cloudflare.SendEmail("Email");
    const email = yield* Cloudflare.SendEmail.bind(Email);

    const send = Effect.fn("AuthEmail.send")(function* (message: EmailMessage) {
      if (IS_DEV) {
        yield* Effect.logWarning("Skipping email send in dev", {
          to: message.to,
          subject: message.subject,
          text: message.text,
        });

        return;
      }

      yield* email
        .send({
          from: EMAIL_ADDRESS,
          ...message,
        })
        .pipe(Effect.mapError((cause) => new Errors.EmailSendError({ cause })));
    });

    return { send };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
