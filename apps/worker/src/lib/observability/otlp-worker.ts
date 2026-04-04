import { waitUntil } from "cloudflare:workers";
import * as Cause from "effect/Cause";
import type * as Exit from "effect/Exit";
import { Layer } from "effect";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import { CurrentLogAnnotations, CurrentLogSpans } from "effect/References";
import * as Tracer from "effect/Tracer";
import { OtlpResource } from "effect/unstable/observability";
import { OTLP_BASE_URL, resourceAttributes } from "./shared";

// Copied from Effect 4.0.0-beta.42:
// - packages/effect/src/unstable/observability/OtlpLogger.ts
// - packages/effect/src/unstable/observability/OtlpTracer.ts
// Why: Cloudflare Worker request handling cannot rely on the default batched OTLP exporters.
// Modifications: trimmed to worker-only immediate export, switched transport to `waitUntil(fetch(...))`,
// kept only trace/log payload shaping used here, and kept the API surface local to this app.

const send = (url: string, body: unknown) => {
  waitUntil(
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => undefined),
  );
};

const makeImmediateLogger = (serviceName: string) => {
  const resource = OtlpResource.make({
    serviceName,
    attributes: resourceAttributes,
  });

  return Logger.make((options) => {
    const now = BigInt(options.date.getTime()) * 1_000_000n;
    const nowMillis = options.date.getTime();
    const attributes = OtlpResource.entriesToAttributes(
      Object.entries(options.fiber.getRef(CurrentLogAnnotations)),
    );

    attributes.push({
      key: "fiberId",
      value: { intValue: options.fiber.id },
    });

    for (const [label, startTime] of options.fiber.getRef(CurrentLogSpans)) {
      attributes.push({
        key: `logSpan.${label}`,
        value: { stringValue: `${nowMillis - startTime}ms` },
      });
    }

    if (options.cause.reasons.length > 0) {
      attributes.push({
        key: "log.error",
        value: { stringValue: Cause.pretty(options.cause) },
      });
    }

    const message = Array.isArray(options.message) ? options.message : [options.message];

    send(`${OTLP_BASE_URL}/v1/logs`, {
      resourceLogs: [
        {
          resource,
          scopeLogs: [
            {
              scope: { name: serviceName },
              logRecords: [
                {
                  severityNumber: logLevelToSeverityNumber(options.logLevel),
                  severityText: options.logLevel,
                  timeUnixNano: now.toString(),
                  observedTimeUnixNano: now.toString(),
                  attributes,
                  body: OtlpResource.unknownToAttributeValue(
                    message.length === 1 ? message[0] : message,
                  ),
                  droppedAttributesCount: 0,
                  traceId: options.fiber.currentSpan?.traceId,
                  spanId: options.fiber.currentSpan?.spanId,
                },
              ],
            },
          ],
        },
      ],
    });
  });
};

type SpanEvent = readonly [
  name: string,
  startTime: bigint,
  attributes: Record<string, unknown> | undefined,
];

type MutableSpan = Tracer.Span & {
  traceId: string;
  spanId: string;
  events: Array<SpanEvent>;
  readonly export: (span: MutableSpan) => void;
  readonly attributes: Map<string, unknown>;
  readonly links: Array<Tracer.SpanLink>;
  status: Tracer.SpanStatus;
};

const SpanProto = {
  _tag: "Span",
  end(this: MutableSpan, endTime: bigint, exit: Exit.Exit<unknown, unknown>) {
    this.status = {
      _tag: "Ended",
      startTime: this.status.startTime,
      endTime,
      exit,
    };
    this.export(this);
  },
  attribute(this: MutableSpan, key: string, value: unknown) {
    this.attributes.set(key, value);
  },
  event(this: MutableSpan, name: string, startTime: bigint, attributes?: Record<string, unknown>) {
    this.events.push([name, startTime, attributes]);
  },
  addLinks(this: MutableSpan, links: ReadonlyArray<Tracer.SpanLink>) {
    this.links.push(...links);
  },
} satisfies Pick<Tracer.Span, "_tag" | "end" | "attribute" | "event" | "addLinks">;

const makeSpan = (options: {
  readonly name: string;
  readonly parent: Option.Option<Tracer.AnySpan>;
  readonly annotations: Tracer.Span["annotations"];
  readonly status: Tracer.SpanStatus;
  readonly links: ReadonlyArray<Tracer.SpanLink>;
  readonly kind: Tracer.SpanKind;
  readonly sampled: boolean;
  readonly export: (span: MutableSpan) => void;
}) => {
  const span = Object.assign(Object.create(SpanProto), {
    ...options,
    attributes: new Map<string, unknown>(),
    events: [],
  }) as MutableSpan;

  span.traceId = Option.isSome(span.parent) ? span.parent.value.traceId : generateId(32);
  span.spanId = generateId(16);

  return span;
};

const makeOtlpSpan = (span: MutableSpan) => {
  const status = span.status as Extract<Tracer.SpanStatus, { _tag: "Ended" }>;
  const attributes = OtlpResource.entriesToAttributes(span.attributes.entries());
  const events = span.events.map(([name, startTime, eventAttributes]) => ({
    name,
    timeUnixNano: String(startTime),
    attributes: eventAttributes
      ? OtlpResource.entriesToAttributes(Object.entries(eventAttributes))
      : [],
    droppedAttributesCount: 0,
  }));

  let otlpStatus: { code: 1 | 2; message?: string } = { code: 1 };

  if (status.exit._tag === "Failure") {
    if (Cause.hasInterruptsOnly(status.exit.cause)) {
      attributes.push({
        key: "status.interrupted",
        value: { boolValue: true },
      });
    } else {
      const errors = Cause.prettyErrors(status.exit.cause);
      otlpStatus = { code: 2, message: errors[0]?.message };

      for (const error of errors) {
        events.push({
          name: "exception",
          timeUnixNano: String(status.endTime),
          droppedAttributesCount: 0,
          attributes: makeExceptionAttributes(error),
        });
      }
    }
  }

  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: Option.getOrUndefined(Option.map(span.parent, (parent) => parent.spanId)),
    name: span.name,
    kind: spanKindToNumber(span.kind),
    startTimeUnixNano: String(status.startTime),
    endTimeUnixNano: String(status.endTime),
    attributes,
    droppedAttributesCount: 0,
    events,
    droppedEventsCount: 0,
    status: otlpStatus,
    links: span.links.map((link) => ({
      traceId: link.span.traceId,
      spanId: link.span.spanId,
      attributes: OtlpResource.entriesToAttributes(Object.entries(link.attributes)),
      droppedAttributesCount: 0,
    })),
    droppedLinksCount: 0,
  };
};

const makeImmediateTracer = (serviceName: string) => {
  const resource = OtlpResource.make({
    serviceName,
    attributes: resourceAttributes,
  });

  return Tracer.make({
    span(options) {
      return makeSpan({
        ...options,
        status: {
          _tag: "Started",
          startTime: options.startTime,
        },
        export: (span) => {
          if (!span.sampled || span.status._tag !== "Ended") return;

          send(`${OTLP_BASE_URL}/v1/traces`, {
            resourceSpans: [
              {
                resource,
                scopeSpans: [
                  {
                    scope: { name: serviceName },
                    spans: [makeOtlpSpan(span)],
                  },
                ],
              },
            ],
          });
        },
      });
    },
  });
};

export const makeImmediateLayer = (serviceName: string) =>
  Layer.merge(
    Logger.layer([makeImmediateLogger(serviceName)], { mergeWithExisting: true }),
    Layer.succeed(Tracer.Tracer, makeImmediateTracer(serviceName)),
  );

const standardExceptionPropertyNames = new Set(["name", "message", "stack", "cause"]);

const makeExceptionAttributes = (error: Error) => {
  const attributes = [
    makeAttribute("exception.type", error.name),
    makeAttribute("exception.message", error.message),
    makeAttribute("exception.stacktrace", error.stack ?? "No stack trace available"),
  ];

  for (const [key, value] of Object.entries(error)) {
    if (standardExceptionPropertyNames.has(key)) continue;
    attributes.push(makeAttribute(`exception.${key}`, value));
  }

  appendErrorCauseAttributes(attributes, "exception.cause", error.cause);

  return attributes;
};

const appendErrorCauseAttributes = (
  attributes: Array<{ key: string; value: OtlpResource.AnyValue }>,
  prefix: string,
  value: unknown,
  depth = 0,
): void => {
  if (value === undefined || depth > 3) return;

  if (!isRecord(value)) {
    attributes.push(makeAttribute(prefix, value));
    return;
  }

  if (typeof value.name === "string") {
    attributes.push(makeAttribute(`${prefix}.type`, value.name));
  }

  if (typeof value.message === "string") {
    attributes.push(makeAttribute(`${prefix}.message`, value.message));
  }

  if (typeof value.stack === "string") {
    attributes.push(makeAttribute(`${prefix}.stacktrace`, value.stack));
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (standardExceptionPropertyNames.has(key)) continue;
    attributes.push(makeAttribute(`${prefix}.${key}`, nestedValue));
  }

  appendErrorCauseAttributes(attributes, `${prefix}.cause`, getErrorCause(value), depth + 1);
};

const makeAttribute = (key: string, value: unknown) => ({
  key,
  value: OtlpResource.unknownToAttributeValue(value),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getErrorCause = (value: Record<string, unknown>) => value.cause;

const generateId = (length: number) => {
  const chars = "0123456789abcdef";
  let result = "";

  for (let index = 0; index < length; index++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
};

const spanKindToNumber = (kind: Tracer.SpanKind) => {
  switch (kind) {
    case "internal":
      return 1;
    case "server":
      return 2;
    case "client":
      return 3;
    case "producer":
      return 4;
    case "consumer":
      return 5;
  }
};

const logLevelToSeverityNumber = (level: string) => {
  switch (level) {
    case "Trace":
      return 1;
    case "Debug":
      return 5;
    case "Info":
      return 9;
    case "Warn":
      return 13;
    case "Error":
      return 17;
    case "Fatal":
      return 21;
    default:
      return 9;
  }
};
