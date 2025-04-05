import { PluginKey, Plugin } from '@tiptap/pm/state';
import * as Y from 'yjs';
import { YDocService } from '@/services/ydoc.service';

/**
 * Custom plugin that ensures that external YDoc updates are reflected in the editor
 * This solves the issue where updates from syncSingle are applied to the YDoc
 * but not visible in the editor
 */
export const YjsSyncPluginKey = new PluginKey('yjs-sync-plugin');

interface YjsSyncPluginOptions {
  /**
   * The note ID associated with this editor
   */
  noteId: string;
  
  /**
   * The YDoc associated with this editor
   */
  ydoc: Y.Doc;
  
  /**
   * The XML fragment name within the YDoc
   */
  fragmentName?: string;
}

/**
 * Creates a plugin that ensures YDoc updates are properly reflected in the editor
 */
export function createYjsSyncPlugin(options: YjsSyncPluginOptions) {
  const { noteId, ydoc, fragmentName = 'prosemirror' } = options;
  
  return new Plugin({
    key: YjsSyncPluginKey,
    
    view(view) {
      // Get the XML fragment from the YDoc
      const fragment = ydoc.getXmlFragment(fragmentName);
      
      // Subscribe to YDocService updates
      const subscription = YDocService.getUpdates().subscribe(event => {
        if (event.docId === noteId && event.source === 'remote') {
          console.log('[YjsSyncPlugin] Received remote update for note:', noteId);
          
          // Force a view update in the next animation frame
          window.requestAnimationFrame(() => {
            // Create a transaction that will force the view to update
            const tr = view.state.tr;
            // Mark the transaction as coming from a remote source
            tr.setMeta('remote-update', true);
            
            // Dispatch the transaction to update the view
            view.dispatch(tr);
            
            console.log('[YjsSyncPlugin] View updated with remote changes');
          });
        }
      });
      
      // Set up a direct observer on the fragment to catch all changes
      const observer = () => {
        // Use requestAnimationFrame to avoid flooding with updates
        window.requestAnimationFrame(() => {
          if (view.isDestroyed) return;
          
          // Force the view to update by creating a transaction
          const tr = view.state.tr;
          // We mark this transaction as being from the observer
          tr.setMeta('ydoc-observer-update', true);
          view.dispatch(tr);
        });
      };
      
      // Observe deep changes to catch all modifications to the fragment
      fragment.observeDeep(observer);
      
      return {
        destroy() {
          // Clean up subscription and observer when plugin is destroyed
          subscription.unsubscribe();
          fragment.unobserveDeep(observer);
        }
      };
    }
  });
}