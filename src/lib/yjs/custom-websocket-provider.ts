import * as Y from "yjs";
import { getClientId } from "@/sqlocal/migrations/2025-04-05";
import {
  createNoteUpdateMessage,
  NoteUpdateDownstreamMessage,
} from "@/schemas/ws";
import { NoteService } from "@/services/note.service";
import { YjsUtils } from "../yjs.utils";
import { AsyncDebouncer } from "@tanstack/react-pacer";
import { WsStore } from "@/routes/-ws-provider";

/**
 * A custom YJS provider that integrates with our existing WebSocket connection
 * and ensures editor changes are visible when remote updates are received
 */
export class CustomWebsocketProvider {
  // The YJS document this provider is attached to
  public ydoc: Y.Doc;
  // The WebSocket connection
  private store: WsStore;
  // The note ID this provider is for
  private noteId: string;
  // A flag to track if we're currently syncing (to avoid loops)
  private isSyncing: boolean = false;
  // Whether this provider is destroyed
  private _destroyed: boolean = false;
  // Unsubscribe function for YDoc update listener
  private destroyListeners: (() => void) | undefined;
  public sendUpdate: AsyncDebouncer<() => Promise<void>, []>;

  /**
   * Create a new CustomWebsocketProvider that integrates with the existing WebSocket
   */
  constructor(noteId: string, ydoc: Y.Doc, store: WsStore) {
    this.noteId = noteId;
    this.ydoc = ydoc;
    this.store = store;

    // Setup listeners
    this.setupListeners();

    this.sendUpdate = new AsyncDebouncer(
      async () => {
        await this._sendUpdate();
      },
      { wait: 1000 },
    );
  }

  /**
   * Set up the necessary event listeners
   */
  private setupListeners() {
    // Listen for YDoc updates to send to the server
    const updateHandler = (_update: Uint8Array, origin: any) => {
      // Only send updates if they originated locally (not from remote syncs)
      if ((!origin || origin.source !== "remote") && !this.isSyncing) {
        // Debounce updates to avoid flooding the server
        this.sendUpdate.maybeExecute();
      }
    };
    this.ydoc.on("update", updateHandler);

    // Store unsubscribe function
    this.destroyListeners = () => {
      this.ydoc.off("update", updateHandler);
    };
  }

  /**
   * Send the current YDoc state to the server
   */
  private async _sendUpdate() {
    try {
      const { vector_clock } = await NoteService.get({ id: this.noteId });

      const updatedNote = await NoteService.update({
        noteId: this.noteId,
        ydoc: this.ydoc,
        vector_clock,
        shouldIncrementVectorClock: true,
      });

      const ws = this.store.getState().ws;

      // Don't send updates if we're disconnected
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }

      console.log(
        `[CustomWebsocketProvider] Sending update for note: ${this.noteId}`,
      );

      // Encode the current state
      const content = Y.encodeStateAsUpdate(this.ydoc);
      const sv = Y.encodeStateVector(this.ydoc);

      // Create the update message
      const message = createNoteUpdateMessage({
        clientId: getClientId(),
        note: {
          content: Array.from(content),
          id: this.noteId,
          sv: Array.from(sv),
          dailyAt: updatedNote.daily_at,
          vectorClock: updatedNote.vector_clock,
        },
      });

      // Send the update
      ws.send(message);
    } catch (err) {
      console.error("[CustomWebsocketProvider] Failed to send update:", err);
    }
  }

  /**
   * Apply a remote update to the YDoc
   * This would typically be called when processing a WebSocket message
   */
  public async applyRemoteUpdate(remoteNote: NoteUpdateDownstreamMessage) {
    // Mark that we're syncing to prevent loops
    this.isSyncing = true;

    try {
      // Create update origin to mark this as a remote update
      const remoteUpdateOrigin = { source: "remote", id: this.noteId };
      const remoteContent = getContentArray(remoteNote.content);

      // Apply the update in a transaction
      this.ydoc.transact(() => {
        Y.applyUpdate(this.ydoc, remoteContent, remoteUpdateOrigin);
      }, remoteUpdateOrigin);

      console.log(
        `[CustomWebsocketProvider] Applied remote update to YDoc for note: ${this.noteId}`,
      );

      const equalSnapshots = YjsUtils.compareSnapshots(
        remoteContent,
        this.ydoc,
      );

      if (equalSnapshots) {
        console.log(
          `[CustomWebsocketProvider] Comparing snapshost equalSnapshots`,
          equalSnapshots,
        );
      }

      await NoteService.update({
        noteId: remoteNote.id,
        ydoc: this.ydoc,
        vector_clock: remoteNote.vectorClock,
        shouldIncrementVectorClock: !equalSnapshots,
      });

      if (!equalSnapshots) {
        this.sendUpdate.maybeExecute();
      }
    } catch (err) {
      console.error(
        "[CustomWebsocketProvider] Error applying update to YDoc:",
        err,
      );
    } finally {
      // End syncing state
      this.isSyncing = false;
    }
  }

  /**
   * Called when the provider is no longer needed
   */
  public destroy() {
    if (this._destroyed) return;

    // Remove all listeners
    if (this.destroyListeners) {
      this.destroyListeners();
    }
    this.sendUpdate.setOptions({
      enabled: false,
    });

    // Mark as destroyed
    this._destroyed = true;
  }
}

/** Ensure content is Uint8Array */
function getContentArray(content: Uint8Array | number[]) {
  const contentArray =
    content instanceof Uint8Array ? content : new Uint8Array(content);
  return contentArray;
}
