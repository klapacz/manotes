import { createContext, useContext, type JSX, type ParentProps } from "solid-js";

export type NoteLinkTarget = {
  id: string;
};

export type NoteLinkProps = NoteLinkTarget &
  Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children?: JSX.Element;
  };

export type NoteLinkRenderer = (props: NoteLinkProps) => JSX.Element;

const Context = createContext<NoteLinkRenderer>();

export function NoteLink(props: NoteLinkProps): JSX.Element {
  const render = useContext(Context);
  if (!render) throw new Error("NoteLink must be used inside NoteLinkScope");
  return render(props);
}

export function NoteLinkScope(props: ParentProps<{ render: NoteLinkRenderer }>): JSX.Element {
  return <Context.Provider value={props.render}>{props.children}</Context.Provider>;
}
