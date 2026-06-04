export type { RelayMiddlewareOptions } from "./middleware.js";
export { middleware } from "./middleware.js";
export { scanExpressRoutes } from "./route-scanner.js";
export type { DiscoveredAction } from "./route-scanner.js";

// Re-export `describe` so users can `import { middleware, describe } from "@relay/express"`
// without also pulling in @relay/core directly.
export { describe } from "@relay/core";
export type { DescribeAnnotation } from "@relay/core";
