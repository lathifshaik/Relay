/**
 * Thrown by adapters when the wrapped route answered with a non-2xx status.
 * `handleAct` turns it into a Relay response that keeps the status class but
 * never forwards the upstream body, which may contain internals.
 */
export class RelayUpstreamError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Upstream handler responded with status ${status}`);
    this.name = "RelayUpstreamError";
    this.status = status;
  }
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}
