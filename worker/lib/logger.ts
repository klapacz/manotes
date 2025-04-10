import {
  BaseTransport,
  LogLevel,
  type LogLayerTransportConfig,
  type LogLayerTransportParams,
} from "@loglayer/transport";
import { LogLayer } from "loglayer";

type ConsoleType = typeof console;

export interface CustomLoggerTransportConfig
  extends LogLayerTransportConfig<ConsoleType> {}

export class CustomLoggerTransport extends BaseTransport<ConsoleType> {
  messageField = "message";
  levelField = "level";

  constructor(config: CustomLoggerTransportConfig) {
    super(config);
  }

  shipToLogger({ logLevel, messages, data }: LogLayerTransportParams) {
    const messageText = messages.join(" ");
    const logObject = {
      ...(data || {}),
      [this.messageField]: messageText,
      [this.levelField]: logLevel,
    };
    messages = [logObject];

    switch (logLevel) {
      case LogLevel.info:
        this.logger.log(...messages);
        break;
      case LogLevel.warn:
        this.logger.log(...messages);
        break;
      case LogLevel.error:
        this.logger.log(...messages);
        break;
      case LogLevel.trace:
        this.logger.log(...messages);
        break;
      case LogLevel.debug:
        this.logger.log(...messages);
        break;
      case LogLevel.fatal:
        this.logger.log(...messages);
        break;
    }

    return messages;
  }
}

export const baseLogger = new LogLayer({
  transport: new CustomLoggerTransport({
    logger: console,
  }),
});
