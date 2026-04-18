import * as GraphAccessRuntime from "../runtime";
import * as Service from "./service";

export const atom = GraphAccessRuntime.atom.atom(Service.get);
