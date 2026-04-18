import { Effect, Layer, Context } from "effect";
import * as LocalRegistry from "../local-registry";

export type RenameGraphInput = {
  localGraphId: string;
  displayName: string;
};

export class Service extends Context.Service<Service>()("GraphAccess.Commands.Rename.Service", {
  make: Effect.succeed({
    renameGraph: Effect.fn("GraphAccessCommandsRename.renameGraph")(function* ({
      localGraphId,
      displayName,
    }: RenameGraphInput) {
      return yield* LocalRegistry.Repo.renameGraph({
        localGraphId,
        displayName,
      });
    }),
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
