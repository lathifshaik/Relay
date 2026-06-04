import { CodeBlock } from "@/components/ui/CodeBlock";
import {
  DocHeader,
  H2,
  H3,
  InlineCode,
  LI,
  P,
  UL,
} from "@/components/docs/DocPrimitives";
import { PageNav } from "@/components/docs/PageNav";

export const metadata = { title: "Action Graph · Relay docs" };

const FIELD_TYPE = `type FieldType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "enum";

interface IOField {
  type: FieldType;
  required?: boolean;
  description?: string;
  min?: number;
  max?: number;
  enum?: readonly string[];
  items?: IOField;                       // for type: "array"
  properties?: Record<string, IOField>;  // for type: "object"
}`;

const ACTION_DEF = `interface ActionDef {
  actionId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  label: string;
  description?: string;
  inputs: Record<string, IOField>;
  returns: Record<string, IOField>;
  relayAccess: "allowed" | "denied" | "consent-required";
  consentScope?: string;
  tags?: readonly string[];
}

interface ActionGraph {
  relayVersion: string;     // protocol version, currently "0.1"
  appName: string;
  appVersion?: string;
  generatedAt: string;      // ISO timestamp
  actions: ActionDef[];
}`;

const EXAMPLE = `{
  "relayVersion": "0.1",
  "appName": "shop",
  "appVersion": "0.1.0",
  "generatedAt": "2026-06-04T10:01:48.297Z",
  "actions": [
    {
      "actionId": "add_to_cart",
      "method": "POST",
      "path": "/api/cart",
      "label": "Add a product to the cart",
      "inputs": {
        "product_id": { "type": "string", "required": true },
        "quantity": { "type": "integer", "min": 1, "max": 99, "required": true }
      },
      "returns": {
        "cart_id": { "type": "string" },
        "total_items": { "type": "integer" }
      },
      "relayAccess": "allowed"
    }
  ]
}`;

const VALIDATION_ERROR = `{
  "error": "RELAY_VALIDATION_FAILED",
  "field": "quantity",
  "expected": "integer between 1 and 99",
  "received": "string: \\"five\\"",
  "suggestion": "Pass quantity as a number, e.g. 5"
}`;

export default function ProtocolDocs() {
  return (
    <>
      <DocHeader
        eyebrow="Reference"
        title="Action Graph spec"
        lead="The shape of /relay/manifest. Every adapter normalises to this — the only protocol contract you need to understand."
      />

      <H2 id="iofield">IOField</H2>
      <P>
        Every input and output is described by an <InlineCode>IOField</InlineCode>. The
        type system is intentionally narrow: seven primitives covering everything the
        Validator needs to enforce.
      </P>
      <div className="mt-4">
        <CodeBlock filename="@relay/core" language="ts" code={FIELD_TYPE} />
      </div>

      <H2 id="action-def">ActionDef + ActionGraph</H2>
      <div className="mt-4">
        <CodeBlock filename="@relay/core" language="ts" code={ACTION_DEF} />
      </div>

      <H2 id="example">Example manifest</H2>
      <div className="mt-4">
        <CodeBlock filename="GET /relay/manifest" language="json" code={EXAMPLE} />
      </div>

      <H2 id="endpoints">The four endpoints</H2>
      <H3 id="manifest">GET /relay/manifest</H3>
      <P>
        Returns the full Action Graph. Cached per process; rebuilt on app restart.
        Returns 401 if a signing key is set and no Bearer token is provided.
      </P>

      <H3 id="act">POST /relay/act/:actionId</H3>
      <P>
        Validate inputs, invoke the original handler, project the response through the
        action's <InlineCode>returns</InlineCode> schema, return.
      </P>
      <P>Body shape:</P>
      <div className="mt-4">
        <CodeBlock language="json" code={`{ "inputs": { "title": "ship docs" } }`} />
      </div>
      <P>
        Inputs may also be passed at the top level (without the{" "}
        <InlineCode>inputs</InlineCode> wrapper). Both shapes are accepted.
      </P>

      <H3 id="validate">POST /relay/validate</H3>
      <P>
        Same validation as <InlineCode>/relay/act</InlineCode>, but never invokes the
        handler. Returns <InlineCode>200 OK</InlineCode> with{" "}
        <InlineCode>&lbrace; ok: true, actionId &rbrace;</InlineCode> or 400 with the
        validation error.
      </P>

      <H3 id="state">GET /relay/state</H3>
      <P>
        Whatever your <InlineCode>buildState</InlineCode> callback returns — user info,
        workflow step, recent actions. Lets agents avoid re-discovering session context
        on every turn.
      </P>

      <H2 id="errors">Structured validation errors</H2>
      <P>
        Validation failures are designed to be self-correctable by an LLM in a single
        retry. They tell the agent exactly what to fix.
      </P>
      <div className="mt-4">
        <CodeBlock language="json" code={VALIDATION_ERROR} />
      </div>

      <H2 id="status-codes">Status codes</H2>
      <UL>
        <LI>
          <InlineCode>200</InlineCode> — success
        </LI>
        <LI>
          <InlineCode>400 RELAY_VALIDATION_FAILED</InlineCode> — bad input shape
        </LI>
        <LI>
          <InlineCode>401 RELAY_UNAUTHENTICATED</InlineCode> — missing/invalid token
        </LI>
        <LI>
          <InlineCode>403 RELAY_FORBIDDEN</InlineCode> — blocked route
        </LI>
        <LI>
          <InlineCode>403 RELAY_OUT_OF_SCOPE</InlineCode> — token scope doesn't include
          actionId
        </LI>
        <LI>
          <InlineCode>404 RELAY_ACTION_NOT_FOUND</InlineCode> — unknown actionId
        </LI>
        <LI>
          <InlineCode>500 INTERNAL_ERROR</InlineCode> — handler threw; original error
          message is sanitised away
        </LI>
      </UL>

      <PageNav pathname="/docs/protocol" />
    </>
  );
}
