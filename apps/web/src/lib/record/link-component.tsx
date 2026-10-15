import { createContext, useContext, type JSX, type ParentProps } from "solid-js";

export type RecordLinkTarget = {
  id: string;
};

export type RecordLinkProps = RecordLinkTarget &
  Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children?: JSX.Element;
  };

export type RecordLinkRenderer = (props: RecordLinkProps) => JSX.Element;

const Context = createContext<RecordLinkRenderer>();

export function RecordLink(props: RecordLinkProps): JSX.Element {
  const render = useContext(Context);

  if (!render) throw new Error("RecordLink must be used inside RecordLinkScope");

  return render(props);
}

export function RecordLinkScope(props: ParentProps<{ render: RecordLinkRenderer }>): JSX.Element {
  return <Context.Provider value={props.render}>{props.children}</Context.Provider>;
}
