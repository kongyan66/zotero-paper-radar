import { config } from "../package.json";
import Addon from "./addon";

// The plugin sandbox exposes this instance to bootstrap.js and Zotero windows.
// @ts-expect-error Plugin instances are intentionally attached by dynamic name.
if (!Zotero[config.addonInstance]) {
  _globalThis.addon = new Addon();
  // @ts-expect-error Plugin instances are intentionally attached by dynamic name.
  Zotero[config.addonInstance] = addon;
}
