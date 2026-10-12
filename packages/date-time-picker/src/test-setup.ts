import { cleanup } from "@solidjs/testing-library";
import { afterEach } from "vitest";

// jsdom omits this CSS initial value; Kobalte's presence helper waits for an animation otherwise.
const style = document.createElement("style");

style.textContent = "* { animation-name: none; }";

document.head.append(style);

afterEach(cleanup);
