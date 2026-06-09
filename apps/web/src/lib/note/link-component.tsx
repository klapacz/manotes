import { Link } from "@tanstack/solid-router";
import { createContext, splitProps, useContext, type JSX, type ParentProps } from "solid-js";
import * as NoteLinkOptions from "./link";

export type NoteLinkTarget = {
  id: string;
  isDaily: boolean;
};

export type NoteLinkProps = NoteLinkTarget &
  Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    children?: JSX.Element;
  };

export type NoteLinkRenderer = (props: NoteLinkProps) => JSX.Element;

const Context = createContext<NoteLinkRenderer>(DefaultNoteLink);

export function NoteLink(props: NoteLinkProps): JSX.Element {
  const render = useContext(Context);
  return render(props);
}

export function NoteLinkScope(props: ParentProps<{ render: NoteLinkRenderer }>): JSX.Element {
  return <Context.Provider value={props.render}>{props.children}</Context.Provider>;
}

function DefaultNoteLink(props: NoteLinkProps): JSX.Element {
  const [target, anchorProps] = splitProps(props, ["id", "isDaily", "children"]);

  return (
    <Link {...NoteLinkOptions.getOptions(target)} {...anchorProps}>
      {target.children}
    </Link>
  );
}
