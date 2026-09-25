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
