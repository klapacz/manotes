import { Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { OtlpLogger, OtlpSerialization, OtlpTracer } from "effect/unstable/observability";
import { OTLP_BASE_URL, resourceAttributes } from "./shared";

const makeEnabledLayer = (serviceName: string) => {
  const resource = {
    serviceName,
    attributes: resourceAttributes,
  };

  return Layer.merge(
    OtlpTracer.layer({
      url: `${OTLP_BASE_URL}/v1/traces`,
      resource,
    }),
    OtlpLogger.layer({
      url: `${OTLP_BASE_URL}/v1/logs`,
      resource,
    }),
  ).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(FetchHttpClient.layer));
};

export const layer = (serviceName: string) =>
  import.meta.env.DEV ? makeEnabledLayer(serviceName) : Layer.empty;
