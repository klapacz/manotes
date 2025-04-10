import { DurableObject } from "cloudflare:workers";
import { drizzle, DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import * as tables from "./schema";
import { VectorClock } from "./schema";
import type { LocalMetadata, NoteInput } from "../routers/note";
import { and, eq, sql } from "drizzle-orm";
import migrations from "../../migrations/graph-do/migrations";
import {
  validateNoteUpdateMessageSchema,
  createNoteUpdateDownstreamMessage,
} from "../../src/schemas/ws";
import { baseLogger } from "../lib/logger";
import { LogLayer } from "loglayer";

export class GraphDurableObject extends DurableObject {
  storage: DurableObjectStorage;
  db: DrizzleSqliteDODatabase<any>;
  log: LogLayer;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.storage = ctx.storage;
    this.db = drizzle(this.storage, { logger: false });
    ctx.blockConcurrencyWhile(async () => {
      await this._migrate();
    });

    this.log = baseLogger.withContext({
      durableObjectId: ctx.id.toString(),
      service: "GraphDurableObject",
    });
  }

  getSyncPlan(input: { localMetadata: LocalMetadata }) {
    // Get all user's notes metadata from server
    const serverMetadata = this.db
      .select({
        id: tables.note.id,
        vectorClock: tables.note.vectorClock,
        dailyAt: tables.note.dailyAt,
        content: tables.note.content,
        sv: tables.note.sv,
      })
      .from(tables.note)
      .all();

    // Build maps for efficient lookup
    const localMap = new Map(
      input.localMetadata.map((item) => [item.id, item.vectorClock]),
    );
    const serverMap = new Map(serverMetadata.map((item) => [item.id, item]));

    // Find notes client needs to download
    const notesToDownload = [];
    for (const [id, serverNote] of serverMap.entries()) {
      const localClock = localMap.get(id);
      if (!localClock || needsUpdate(localClock, serverNote.vectorClock)) {
        notesToDownload.push(serverNote);
      }
    }

    // Find notes server needs
    const notesToUpload = [];
    for (const [id, localClock] of localMap.entries()) {
      const serverNote = serverMap.get(id);
      if (!serverNote || needsUpdate(serverNote.vectorClock, localClock)) {
        notesToUpload.push(id);
      }
    }

    return { notesToDownload, notesToUpload };
  }

  save(input: { notes: NoteInput[]; clientId: string }) {
    for (const inputNote of input.notes) {
      const serverNote = this.db
        .select()
        .from(tables.note)
        .where(and(eq(tables.note.id, inputNote.id)))
        .get();

      // Check if the server note didn't change we last saw it
      if (serverNote) {
        const result = onlyClientChanged(
          serverNote.vectorClock,
          inputNote.oldVectorClock,
          input.clientId,
        );

        const equal = vectorClocksEqual(
          serverNote.vectorClock,
          inputNote.oldVectorClock,
        );

        if (!equal && !result) {
          debugger;
          throw new Error("Server note has changed since last seen");
        }
      }

      this.db
        .insert(tables.note)
        .values({
          id: inputNote.id,
          content: inputNote.content,
          sv: inputNote.sv,
          dailyAt: inputNote.daily_at,
          vectorClock: inputNote.newVectorClock,
        })
        .onConflictDoUpdate({
          target: [tables.note.id],
          set: {
            content: sql`excluded.content`,
            sv: sql`excluded.sv`,
            dailyAt: sql`excluded.daily_at`,
            vectorClock: sql`excluded.vector_clock`,
          },
        })
        .returning({
          id: tables.note.id,
        })
        .execute();
    }
  }

  purge() {
    this.db.delete(tables.note).run();
  }

  async fetch(request: Request): Promise<Response> {
    // Creates two ends of a WebSocket connection.
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Calling `acceptWebSocket()` informs the runtime that this WebSocket is to begin terminating
    // request within the Durable Object. It has the effect of "accepting" the connection,
    // and allowing the WebSocket to send and receive messages.
    // Unlike `ws.accept()`, `state.acceptWebSocket(ws)` informs the Workers Runtime that the WebSocket
    // is "hibernatable", so the runtime does not need to pin this Durable Object to memory while
    // the connection is open. During periods of inactivity, the Durable Object can be evicted
    // from memory, but the WebSocket connection will remain open. If at some later point the
    // WebSocket receives a message, the runtime will recreate the Durable Object
    // (run the `constructor`) and deliver the message to the appropriate handler.
    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
    const log = this.log.withContext({ method: "webSocketMessage" });
    log
      .withMetadata({ connectedWebSockets: this.ctx.getWebSockets().length })
      .info("Received message");

    if (typeof message !== "string") {
      log.withMetadata({ input: message }).error("Invalid message type");
      return;
    }
    const result = validateNoteUpdateMessageSchema(message);
    if (!result.success) {
      log
        .withMetadata({ input: message, error: result.error })
        .error("Invalid message schema");
      return;
    }
    const input = result.data;
    const inputNote = result.data.note;

    const serverNote = this.db
      .select()
      .from(tables.note)
      .where(and(eq(tables.note.id, inputNote.id)))
      .get();

    // Check if the server note didn't change we last saw it
    if (serverNote) {
      const result = onlyClientChanged(
        serverNote.vectorClock,
        inputNote.vectorClock,
        input.clientId,
      );

      const equal = vectorClocksEqual(
        serverNote.vectorClock,
        inputNote.vectorClock,
      );

      log
        .withMetadata({
          onlyClientChanged: result,
          equal,
        })
        .info("Merging server note,");

      if (!equal && !result) {
        const updateDownstreamMessage = createNoteUpdateDownstreamMessage({
          content: Array.from(serverNote.content),
          dailyAt: serverNote.dailyAt,
          id: serverNote.id,
          sv: Array.from(serverNote.sv),
          vectorClock: serverNote.vectorClock,
        });

        ws.send(updateDownstreamMessage);

        log.error("Server note has changed since last seen");
        return;
      }
    }

    const updatedNote = this.db
      .insert(tables.note)
      .values({
        id: inputNote.id,
        content: inputNote.content,
        sv: inputNote.sv,
        dailyAt: inputNote.dailyAt,
        vectorClock: inputNote.vectorClock,
      })
      .onConflictDoUpdate({
        target: [tables.note.id],
        set: {
          content: sql`excluded.content`,
          sv: sql`excluded.sv`,
          dailyAt: sql`excluded.daily_at`,
          vectorClock: sql`excluded.vector_clock`,
        },
      })
      .returning()
      .get();

    for (const otherWs of this.ctx.getWebSockets()) {
      if (otherWs === ws) {
        continue;
      }
      const updateDownstreamMessage = createNoteUpdateDownstreamMessage({
        content: Array.from(updatedNote.content),
        dailyAt: updatedNote.dailyAt,
        id: updatedNote.id,
        sv: Array.from(updatedNote.sv),
        vectorClock: updatedNote.vectorClock,
      });

      otherWs.send(updateDownstreamMessage);
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    // If the client closes the connection, the runtime will invoke the webSocketClose() handler.
    ws.close(code, "Durable Object is closing WebSocket");
  }

  async _migrate() {
    migrate(this.db, migrations);
  }
}

// Determines if targetClock needs to be updated based on sourceClock
function needsUpdate(targetClock: VectorClock, sourceClock: VectorClock) {
  // Are they identical?
  if (JSON.stringify(targetClock) === JSON.stringify(sourceClock)) {
    return false;
  }

  // Check if source has changes target doesn't have
  for (const [device, count] of Object.entries(sourceClock)) {
    if ((targetClock[device] || 0) < count) {
      return true;
    }
  }

  return false;
}

function onlyClientChanged(
  baseVectorClock: VectorClock,
  newVectorClock: VectorClock,
  clientId: string,
) {
  // Check if only this client's counter changed
  for (const [device, count] of Object.entries(newVectorClock)) {
    if (device === clientId) {
      // This client's counter should have increased
      if (count <= (baseVectorClock[device] || 0)) {
        return false;
      }
    } else {
      // Other clients' counters should be unchanged
      if (count !== (baseVectorClock[device] || 0)) {
        return false;
      }
    }
  }

  // Check if server has the same base vector clock
  return true; // This will be verified server-side
}

function vectorClocksEqual(a: VectorClock, b: VectorClock) {
  // Check if they have the same keys
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) {
      return false;
    }
  }

  // Check if all values match
  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}
