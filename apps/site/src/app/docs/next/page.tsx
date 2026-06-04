import { CodeBlock } from "@/components/ui/CodeBlock";
import {
  Callout,
  DocHeader,
  H2,
  InlineCode,
  LI,
  P,
  UL,
} from "@/components/docs/DocPrimitives";
import { PageNav } from "@/components/docs/PageNav";

export const metadata = { title: "Next.js · Relay docs" };

const INSTALL = `npm install @relay/core @relay/next`;

const ACTION = `// app/actions/cart.ts
import { defineAction } from "@relay/next";

export const addToCart = defineAction({
  actionId: "add_to_cart",
  method: "POST",
  path: "/api/cart",
  label: "Add a product to the cart",
  inputs: {
    product_id: { type: "string", required: true },
    quantity: { type: "integer", min: 1, max: 99, required: true },
  },
  returns: {
    cart_id: { type: "string" },
    total_items: { type: "integer" },
  },
  async handler({ product_id, quantity }) {
    // ... your business logic here
    return { cart_id: "c_1", total_items: quantity as number };
  },
});`;

const ROUTE = `// app/api/cart/route.ts
export { addToCart as POST } from "@/actions/cart";`;

const RELAY_ROUTE = `// app/relay/[[...path]]/route.ts
import { createRelayHandler } from "@relay/next";
import { addToCart, getCart } from "@/actions/cart";
import { listProducts } from "@/actions/products";

const relay = createRelayHandler({
  appName: "shop",
  appVersion: "0.1.0",
  actions: [listProducts, addToCart, getCart],
});

export { relay as GET, relay as POST };`;

export default function NextDocs() {
  return (
    <>
      <DocHeader
        eyebrow="Frameworks"
        title="Next.js (App Router)"
        lead="defineAction() wraps a route handler with full input validation, output projection, and meta the relay endpoint needs to discover it. App Router only."
      />

      <Callout kind="note" title="App Router only">
        Next.js Pages Router uses a different runtime model. Pages Router support is on
        the v0.2 roadmap; for now stick to App Router (Next 14+).
      </Callout>

      <H2 id="install">Install</H2>
      <div className="mt-4">
        <CodeBlock language="sh" code={INSTALL} />
      </div>

      <H2 id="define-action">Define an action</H2>
      <P>
        <InlineCode>defineAction</InlineCode> returns a Next route handler with full
        metadata attached. The same function is your human-facing route handler{" "}
        <em>and</em> the spec the relay catch-all reads.
      </P>
      <div className="mt-4">
        <CodeBlock filename="actions/cart.ts" language="ts" code={ACTION} highlightLines={[4, 5, 6]} />
      </div>

      <H2 id="mount">Mount it as a route</H2>
      <P>
        Re-export the action from your <InlineCode>route.ts</InlineCode> file. Each HTTP
        method maps to a named export.
      </P>
      <div className="mt-4">
        <CodeBlock filename="app/api/cart/route.ts" language="ts" code={ROUTE} />
      </div>

      <H2 id="relay-catchall">Add the Relay catch-all</H2>
      <P>
        A single <InlineCode>app/relay/[[...path]]/route.ts</InlineCode> file handles all
        four Relay endpoints (manifest, act, validate, state). Register your actions
        with <InlineCode>createRelayHandler</InlineCode> and re-export under both{" "}
        <InlineCode>GET</InlineCode> and <InlineCode>POST</InlineCode>.
      </P>
      <div className="mt-4">
        <CodeBlock
          filename="app/relay/[[...path]]/route.ts"
          language="ts"
          code={RELAY_ROUTE}
          highlightLines={[5, 6, 7]}
        />
      </div>

      <H2 id="inputs">Where inputs come from</H2>
      <P>
        Relay merges inputs from three sources, with later sources overriding earlier
        ones:
      </P>
      <UL>
        <LI>
          <strong>Query string</strong> — <InlineCode>request.nextUrl.searchParams</InlineCode>.
        </LI>
        <LI>
          <strong>JSON body</strong> — for any non-GET method.
        </LI>
        <LI>
          <strong>URL path params</strong> — populated from the catch-all context. These
          win for path placeholders, even if the body provides the same key.
        </LI>
      </UL>

      <H2 id="signing-key">Production signing key</H2>
      <P>
        Set <InlineCode>RELAY_SIGNING_KEY</InlineCode> in your environment. The catch-all
        handler picks it up automatically:
      </P>
      <div className="mt-4">
        <CodeBlock
          filename="app/relay/[[...path]]/route.ts"
          language="ts"
          code={`const relay = createRelayHandler({
  appName: "shop",
  actions: [...],
  ...(process.env.RELAY_SIGNING_KEY && {
    signingKey: process.env.RELAY_SIGNING_KEY,
  }),
});`}
        />
      </div>

      <PageNav pathname="/docs/next" />
    </>
  );
}
