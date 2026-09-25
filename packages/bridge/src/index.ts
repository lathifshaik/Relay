export type { ApiTarget, BridgeAction, BridgeGraph, FormFieldKind, FormTarget } from "./types.js";
export {
  apiActionId,
  fieldFromSample,
  inputsFromRequest,
  normaliseMethod,
  placeholderNames,
  propertiesFromSample,
  returnsFromSample,
  templatePath,
  toolName,
} from "./infer.js";
export type { ScannedEndpoint } from "./scan-js.js";
export { sameSite, scanJs } from "./scan-js.js";
export { SPEC_PATHS, actionsFromOpenApi } from "./openapi.js";
export type { HtmlField, HtmlForm, HtmlPage } from "./html.js";
export { htmlToText, pageLines, parseHtml } from "./html.js";
export type { SessionOptions, SessionRequest, SessionResponse } from "./session.js";
export { Session } from "./session.js";
export type { DiscoverOptions, DiscoverResult, DiscoverySource } from "./discover.js";
export { discover } from "./discover.js";
export type { ActionResult } from "./execute.js";
export { callMethodOf, runAction } from "./execute.js";
export type { BridgeOptions, BridgeReply, BridgeStats } from "./bridge.js";
export { Bridge } from "./bridge.js";
export type { LayoutSnapshot } from "./layout.js";
export { LayoutMemory } from "./layout.js";
export type { Change } from "./changes.js";
export { ReadMemory, diff } from "./changes.js";
export type { BridgeServerOptions } from "./server.js";
export { createBridgeServer, exposedActions, runBridgeServer } from "./server.js";
export type { SiteMemory } from "./cache.js";
export { DEFAULT_CACHE_DIR, loadSite, saveSite, siteFile } from "./cache.js";
