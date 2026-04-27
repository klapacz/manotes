import { Context, Effect, Layer } from "effect";
import * as Worker from "../http/worker";
import * as Errors from "./errors";

export type EmailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

export class EmailService extends Context.Service<EmailService>()("Auth.EmailService", {
  make: Effect.gen(function* () {
    const env = yield* Worker.Env;

    const send = Effect.fn("AuthEmail.send")(function* (message: EmailMessage) {
      if (import.meta.env.DEV) {
        yield* Effect.logInfo("Skipping email send in dev", {
          to: message.to,
          subject: message.subject,
          text: message.text,
        });
        return;
      }

      yield* Effect.tryPromise({
        try: () =>
          env.EMAIL.send({
            from: env.EMAIL_ADDRESS,
            ...message,
          }),
        catch: (cause) => new Errors.EmailSendError({ cause }),
      });
    });

    return { send };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
