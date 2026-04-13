import * as BrowserExtension from "@manotes/shared/browser-extension/contract";
import { DateTime, Effect, Layer, ServiceMap } from "effect";
import { nanoid } from "nanoid";
import { prosemirrorJSONToYDoc } from "y-prosemirror";
import * as Y from "yjs";
import * as MaterializedEventService from "../../materialized-event.service";
import { NON_DAILY_NOTE_SCHEMA } from "../../prosemirror/app-schema";
import { PROSEMIRROR_XML_FRAGMENT_KEY } from "../../prosemirror/yjs";

export class Service extends ServiceMap.Service<Service>()(
  "BrowserExtensionTabNoteService.Service",
  {
    make: Effect.gen(function* () {
      const materializedEventService = yield* MaterializedEventService.Service;

      const createFromTab = Effect.fn("BrowserExtensionTabNoteService.createFromTab")(function* (
        tab: BrowserExtension.TabCandidate,
      ) {
        const noteId = nanoid();
        const yDoc = prosemirrorJSONToYDoc(
          NON_DAILY_NOTE_SCHEMA,
          {
            type: "doc",
            content: [
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
            ],
          },
          PROSEMIRROR_XML_FRAGMENT_KEY,
        );
        const payload = Y.encodeStateAsUpdate(yDoc);

        return yield* materializedEventService.create({
          noteId,
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
