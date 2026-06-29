// Application entry point: load persisted state, wire delegated events once,
// then perform the first render.

import { loadState } from "./storage.js";
import { render } from "./render.js";
import { installEvents } from "./events.js";

await loadState();
installEvents();
render();
