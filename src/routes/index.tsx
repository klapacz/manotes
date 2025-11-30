import * as Solid from "solid-js";
import { createFileRoute } from "@tanstack/solid-router";

import logo from "../logo.svg";
import Editor from "../editor";

export const Route = createFileRoute("/")({
  component: IndexComponent,
});

function IndexComponent() {
  return <Editor />;
}
