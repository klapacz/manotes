import * as Cloudflare from "alchemy/Cloudflare";
import { Context, Data, Duration, Effect, Layer } from "effect";
import { customAlphabet } from "nanoid";

const generateOtp = customAlphabet("0123456789", 6);

const OTP_TTL = Duration.minutes(10);

export class OtpService extends Context.Service<OtpService>()("Auth.OtpService", {
  make: Effect.gen(function* () {
    const OTP_KV = yield* Cloudflare.KVNamespace("OTP_KV");
    const kv = yield* Cloudflare.KVNamespace.bind(OTP_KV);

    const create = Effect.fn("AuthOtp.create")(function* (email: string) {
      const otp = generateOtp();

      yield* kv
        .put(email, otp, {
          expirationTtl: Duration.toSeconds(OTP_TTL),
        })
        .pipe(Effect.mapError((cause) => new OtpStoreError({ operation: "write", cause })));

      return otp;
    });

    const verify = Effect.fn("AuthOtp.verify")(function* (email: string, otp: string) {
      const stored = yield* kv
        .get(email)
        .pipe(Effect.mapError((cause) => new OtpStoreError({ operation: "read", cause })));

      if (stored === null || stored !== otp) {
        return yield* Effect.fail(new OtpVerificationError());
      }

      yield* kv
        .delete(email)
        .pipe(Effect.mapError((cause) => new OtpStoreError({ operation: "delete", cause })));
    });

    return { create, verify };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export class OtpStoreError extends Data.TaggedError("Auth.OtpStoreError")<{
  readonly operation: "write" | "read" | "delete";
  readonly cause: unknown;
}> {}

export class OtpVerificationError extends Data.TaggedError("Auth.OtpVerificationError")<{}> {}
