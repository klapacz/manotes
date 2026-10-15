import { RecordSchema } from "@manotes/shared/record.schema";
import * as BrowserExtension from "@manotes/shared/browser-extension/contract";
import { DateTime, Effect, Layer, Context } from "effect";
import { nanoid } from "nanoid";
import * as MaterializedEventService from "../../materialized-event.service";
import { ProsemirrorEncode } from "@manotes/shared/prosemirror/encode";

export class Service extends Context.Service<Service>()(
  "BrowserExtensionTabRecordService.Service",
  {
    make: Effect.gen(function* () {
      const materializedEventService = yield* MaterializedEventService.Service;

      const createFromTab = Effect.fn("BrowserExtensionTabRecordService.createFromTab")(function* (
        tab: BrowserExtension.TabCandidate,
      ) {
        const recordId = RecordSchema.Id.make(nanoid());

        const payload = ProsemirrorEncode.encodeDocument([
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: tab.title }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Source: " },
              {
                type: "text",
                text: tab.url,
                marks: [{ type: "link", attrs: { href: tab.url } }],
              },
            ],
          },
        ]);

        return yield* materializedEventService.create({
          recordId,
          payload,
          createdAt: yield* DateTime.now,
        });
      });

      return {
        createFromTab,
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(MaterializedEventService.Service.layer),
  );
}
