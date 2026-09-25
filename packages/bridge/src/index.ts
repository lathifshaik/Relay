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
export { htmlToText, parseHtml } from "./html.js";
export type { SessionOptions, SessionRequest, SessionResponse } from "./session.js";
export { Session } from "./session.js";
export type { DiscoverOptions, DiscoverResult, DiscoverySource } from "./discover.js";
export { discover } from "./discover.js";
export type { ActionResult } from "./execute.js";
export { readPage, runAction } from "./execute.js";
export type { BridgeServerOptions } from "./server.js";
export { createBridgeServer, exposedActions, runBridgeServer } from "./server.js";
