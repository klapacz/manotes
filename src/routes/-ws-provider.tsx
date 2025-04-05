import { CustomWebsocketProvider } from "@/lib/yjs/custom-websocket-provider";
import { parseNoteUpdateDownstreamMessage } from "@/schemas/ws";
import { NoteService } from "@/services/note.service";
import { createContext, useContext, useEffect, useState } from "react";
import { createStore, StoreApi, useStore } from "zustand";
import * as Y from "yjs";

type StoreContextValue = StoreApi<WsStoreState>;
const StoreContext = createContext<StoreContextValue | null>(null);

type WsStoreState = {
  providers: Map<string, CustomWebsocketProvider>;
  addProvider: (noteId: string, ydoc: Y.Doc) => void;
  removeProvider: (noteId: string, ydoc: Y.Doc) => void;
};

export const WsStoreProvider = ({ children }: React.PropsWithChildren) => {
  const [storeRef, setStoreRef] = useState<StoreContextValue>();

  useEffect(() => {
    // Create a single WebSocket connection to be shared across the app
    const socket = new WebSocket("/ws");

    const store = createStore<WsStoreState>((set) => ({
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
              new CustomWebsocketProvider(noteId, ydoc, socket),
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

    // Listen for messages and route them to the appropriate provider
    socket.addEventListener("message", async (event) => {
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

    setStoreRef(store);

    return () => {
      socket.close();

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
