import type { AccessMode, HttpMethod, IOField } from "@relay/core";
import { sanitiseError, validateInput } from "@relay/core";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { extractInputs } from "./input-extraction.js";

export type RouteParams = Record<string, string | string[] | undefined>;

export interface ActionContext {
  request: NextRequest;
  params: RouteParams;
}

export interface ActionDefinition<TInputs = Record<string, unknown>, TReturns = unknown> {
  actionId: string;
  method: HttpMethod;
  /** Logical path used in the manifest, e.g. "/api/products". Distinct from the file path. */
  path: string;
  label: string;
  description?: string;
  inputs: Record<string, IOField>;
  returns: Record<string, IOField>;
  relayAccess?: AccessMode;
  handler: (inputs: TInputs, ctx: ActionContext) => Promise<TReturns> | TReturns;
}

export interface NextRouteContext {
  params: Promise<RouteParams>;
}

export type NextRouteHandler = (
  request: NextRequest,
  context: NextRouteContext,
) => Promise<Response>;

export type ActionRouteHandler<TInputs = Record<string, unknown>, TReturns = unknown> =
  NextRouteHandler & {
    readonly _relayMeta: ActionDefinition<TInputs, TReturns>;
  };

export function defineAction<TInputs extends Record<string, unknown>, TReturns>(
  def: ActionDefinition<TInputs, TReturns>,
): ActionRouteHandler<TInputs, TReturns> {
  const handler: NextRouteHandler = async (request, context) => {
    const params = (await context.params) ?? {};

    const rawInputs = await extractInputs(request, params);
    const result = validateInput(def.inputs, rawInputs);
    if (!result.ok) {
      return NextResponse.json(result.error, { status: 400 });
    }

    try {
      const output = await def.handler(result.value as TInputs, { request, params });
      return NextResponse.json(output);
    } catch (err) {
      return NextResponse.json(sanitiseError(err), { status: 500 });
    }
  };

  Object.defineProperty(handler, "_relayMeta", { value: def, enumerable: false });
  return handler as ActionRouteHandler<TInputs, TReturns>;
}
