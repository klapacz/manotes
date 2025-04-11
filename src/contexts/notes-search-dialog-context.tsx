import React from "react";

interface NotesSearchDialogContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const NotesSearchDialogContext = React.createContext<NotesSearchDialogContextValue | null>(null);

export function NotesSearchDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <NotesSearchDialogContext.Provider value={{ open, setOpen }}>
      {children}
    </NotesSearchDialogContext.Provider>
  );
}

export function useNotesSearchDialog() {
  const context = React.useContext(NotesSearchDialogContext);
  if (!context) {
    throw new Error("useNotesSearchDialog must be used within a NotesSearchDialogProvider");
  }
  return context;
}