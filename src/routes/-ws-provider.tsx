import { CustomWebsocketProvider } from "@/lib/yjs/custom-websocket-provider";
import { parseNoteUpdateDownstreamMessage } from "@/schemas/ws";
import { NoteService } from "@/services/note.service";
import { createContext, useContext, useEffect, useState } from "react";
import { createStore, StoreApi, useStore } from "zustand";
import * as Y from "yjs";

export type WsStore = StoreApi<WsStoreState>;
const StoreContext = createContext<WsStore | null>(null);

export type WsStoreState = {
  ws: WebSocket | null;
  providers: Map<string, CustomWebsocketProvider>;
  addProvider: (noteId: string, ydoc: Y.Doc) => void;
  removeProvider: (noteId: string, ydoc: Y.Doc) => void;
};

export const WsStoreProvider = ({ children }: React.PropsWithChildren) => {
  const [storeRef, setStoreRef] = useState<WsStore>();

  useEffect(() => {
    const store = createStore<WsStoreState>((set) => ({
      ws: null,
      providers: new Map<string, CustomWebsocketProvider>(),
      addProvider: (noteId: string, ydoc: Y.Doc) =>
        set((state) => {
          const previousProvider = state.providers.get(noteId);
          if (previousProvider) {
            console.log(
              `[Store.addProvider] Destroying previous provider for note ${noteId}`,
            );
            previousProvider.destroy();
          }
          console.log(
            `[Store.addProvider] Creating new provider for note ${noteId}`,
          );

          return {
            ...state,
            providers: new Map(state.providers).set(
              noteId,
              new CustomWebsocketProvider(noteId, ydoc, store),
            ),
          };
        }),
      removeProvider: (noteId: string, ydoc: Y.Doc) =>
        set((state) => {
          const previousProvider = state.providers.get(noteId);
          if (!previousProvider) {
            console.log(`[Store.removeProvider] Provider not found ${noteId}`);
            return state;
          }
          if (previousProvider.ydoc !== ydoc) {
            console.log(`[Store.removeProvider] Ydoc does not match ${noteId}`);
            return state;
          }

          console.log(
            `[Store.removeProvider] Successfully removed provider for note ${noteId}`,
          );

          state.providers.delete(noteId);

          return {
            ...state,
            providers: new Map(state.providers),
          };
        }),
    }));

    const setWs = (ws: WebSocket | null) => {
      store.setState((state) => ({
        ...state,
        ws: ws,
      }));
    };

    function join() {
      let destroyed = false;
      const ws = new WebSocket("/ws");
      // If we are running via wrangler dev, use ws:
      let rejoined = false;
      let startTime = Date.now();

      const rejoin = async () => {
        if (!rejoined && !destroyed) {
          rejoined = true;
          setWs(null);

          // Don't try to reconnect too rapidly.
          let timeSinceLastJoin = Date.now() - startTime;
          if (timeSinceLastJoin < 10000) {
            // Less than 10 seconds elapsed since last join. Pause a bit.
            await new Promise((resolve) =>
              setTimeout(resolve, 10000 - timeSinceLastJoin),
            );
          }

          // OK, reconnect now!
          join();
        }
      };

      ws.addEventListener("open", () => {
        console.log("WebSocket opened");
        setWs(ws);
      });

      ws.addEventListener("close", (event) => {
        console.log(
          "WebSocket closed, reconnecting:",
          event.code,
          event.reason,
        );
        rejoin();
      });
      ws.addEventListener("error", (event) => {
        console.log("WebSocket error, reconnecting:", event);
        rejoin();
      });

      // Listen for messages and route them to the appropriate provider
      ws.addEventListener("message", async (event) => {
        const result = parseNoteUpdateDownstreamMessage(event.data);
        if (!result.success) {
          console.log("Failed to parse message", event.data, result.error);
          return;
        }

        const activeProviders = store.getState().providers;

        const remoteNote = result.data;
        console.log(`Received update for note: ${remoteNote.id}`);

        // If we have a provider for this note, let it handle the update directly
        const provider = activeProviders.get(remoteNote.id);
        if (provider) {
          console.log(
            `Provider found for note ${remoteNote.id}, applying update directly`,
          );
          await provider.applyRemoteUpdate(remoteNote);
        } else {
          // Otherwise use the regular sync mechanism
          console.log(
            `No provider for note ${remoteNote.id}, using NoteService.syncSingle`,
          );
          await NoteService.syncSingle(remoteNote);
        }
      });

      return function clenup() {
        destroyed = true;
        ws.close();
      };
    }

    const cleanup = join();
    setStoreRef(store);

    return () => {
      cleanup();

      // Cleanup any active providers
      store.getState().providers.forEach((provider) => provider.destroy());
      setStoreRef(undefined);
    };
  }, []);

  if (!storeRef) {
    return null;
  }

  return (
    <StoreContext.Provider value={storeRef}>{children}</StoreContext.Provider>
  );
};

export function useWsStore(): WsStoreState;
export function useWsStore<T>(selector: (state: WsStoreState) => T): T;
export function useWsStore<T>(selector?: (state: WsStoreState) => T) {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("Missing StoreProvider");
  }
  return useStore(store, selector!);
}
