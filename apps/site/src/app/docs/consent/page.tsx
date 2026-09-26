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

export const metadata = { title: "Consent model · Relay docs" };

const ACCESS_MODE = `// Set per action in describe() / defineAction():

relayAccess: "allowed"           // default — open to any scoped token
relayAccess: "denied"            // never callable via /relay/act
relayAccess: "consent-required"  // reserved: not enforced differently from "allowed" yet`;

const CONNECT = `app.use(
  relay.middleware({
    appName: "Notes",
    signingKey: process.env.RELAY_SIGNING_KEY!,
    // Turn on "connect an agent" and point signed-out people at your login.
    connect: { loginUrl: "/login" },
    // Who is signed in, using your own auth. Return their user id.
    identify: (req) => req.session?.userId,
  }),
);

// In a handler, an agent's calls carry the user it acts for:
app.get("/notes", relay.describe((req, res) => {
  const userId = req.relay?.subject ?? req.session.userId;
  res.relayRespond({ notes: notesFor(userId) });
}, { actionId: "list_notes", label: "List your notes" }));`;

const FLOW = `POST /relay/connect        → { user_code: "BCDF-GHJK", verification_uri_complete, device_code }
  (the person opens /relay/approve?code=BCDF-GHJK, signs in your usual way,
   ticks what the agent may do, and approves)
POST /relay/connect/token  → { access_token, token_type: "Bearer", scope, expires_in }

GET  /relay/connections                → the signed-in person's connected agents
POST /relay/connections/:id/revoke     → revoke one (JSON request)`;

const SCOPED_TOKEN = `import { issueToken } from "@relay/core";

// Scope this token to one specific actionId — even if the user's bearer
// is stolen, the only thing it can do is read_balance.
const token = issueToken({
  subject: "agent_finance_assistant",
  scope: ["read_balance", "list_transactions"],
  ttlSeconds: 60 * 60,    // 1 hour
  signingKey: process.env.RELAY_SIGNING_KEY!,
});`;

export default function ConsentDocs() {
  return (
    <>
      <DocHeader
        eyebrow="Reference"
        title="Consent model"
        lead="Relay is built consent-first. Site owners control which routes exist in the manifest; end users control which actions an agent can call on their behalf."
      />

      <H2 id="tiers">Three tiers of access control</H2>
      <UL>
        <LI>
          <strong>Site-level block</strong> — controlled by the developer. Entire app
          blocked: agents get 403 on <InlineCode>/relay/manifest</InlineCode>.
        </LI>
        <LI>
          <strong>Route-level block</strong> — controlled by the developer per-route.
          Specific paths excluded from the Action Graph — they never appear in the
          manifest, period.
        </LI>
        <LI>
          <strong>User consent</strong>: controlled by the end user. An agent asks to
          connect, and the person approves exactly which actions it may call on the
          site's own consent page. See <a href="#connect">Connecting an agent</a>.
        </LI>
      </UL>

      <H2 id="relay-access">Per-action access mode</H2>
      <P>
        Every action declares a <InlineCode>relayAccess</InlineCode> mode in its
        annotation:
      </P>
      <div className="mt-4">
        <CodeBlock language="ts" code={ACCESS_MODE} />
      </div>

      <H2 id="banking-use-case">Banking-grade use case</H2>
      <P>
        The canonical "compromise resistance" pattern: a personal finance agent
        authorised to read balance + transactions, but structurally unable to initiate
        transfers — even if its token is stolen.
      </P>
      <UL>
        <LI>
          Mark transfer routes with <InlineCode>relayAccess: "denied"</InlineCode>, OR
          omit <InlineCode>describe()</InlineCode> entirely so they don't appear in the
          manifest.
        </LI>
        <LI>
          Sign agent tokens with read-only scope.
        </LI>
        <LI>
          Default block list already catches <InlineCode>/bank</InlineCode>,{" "}
          <InlineCode>/payment</InlineCode>, <InlineCode>/card</InlineCode> — opt out
          intentionally with <InlineCode>createBlockList()</InlineCode> allows if you
          really need to expose a subset.
        </LI>
      </UL>

      <div className="mt-6">
        <CodeBlock filename="server.ts" language="ts" code={SCOPED_TOKEN} highlightLines={[6, 7]} />
      </div>

      <Callout kind="info" title="Why the manifest matters">
        An action that's not in the manifest is invisible to agents. They don't know
        the actionId exists, so they can't even attempt to call it. This is structural
        protection, not policy — the only way to call a blocked route is to bypass
        Relay entirely (i.e. impersonate a human session).
      </Callout>

      <H2 id="connect">Connecting an agent</H2>
      <P>
        Agents connect to a person&apos;s account the way a TV app signs in (OAuth device
        authorization, RFC 8628). The agent gets a short code. The person approves it on
        your site, after signing in your usual way, so passwords, 2FA and single sign-on
        stay yours. The agent then receives a token limited to the actions the person
        ticked, tied to their user id and revocable at any time.
      </P>
      <div className="mt-4">
        <CodeBlock filename="server.ts" language="ts" code={CONNECT} />
      </div>
      <div className="mt-4">
        <CodeBlock language="text" code={FLOW} />
      </div>
      <UL>
        <LI>
          The consent page shows the agent&apos;s name as unverified and warns people to
          approve only codes they started themselves. It can&apos;t be framed by other
          sites, and its form is CSRF-protected.
        </LI>
        <LI>
          Denied and block-listed actions can never be granted, even if an agent asks
          for them.
        </LI>
        <LI>
          Tokens are handed over once, last 7 days by default (<InlineCode>tokenTtlSeconds</InlineCode>),
          and revoking one takes effect immediately.
        </LI>
        <LI>
          <InlineCode>/.well-known/relay.json</InlineCode> is served automatically, so
          agents and <InlineCode>relay-bridge login</InlineCode> discover the flow on
          their own.
        </LI>
        <LI>
          Pending requests and grants live in memory by default. Pass a{" "}
          <InlineCode>ConnectionStore</InlineCode> and a <InlineCode>TokenStore</InlineCode>{" "}
          backed by your database for production and multiple instances.
        </LI>
        <LI>
          Handlers see the user as <InlineCode>req.relay.subject</InlineCode> (Express),{" "}
          <InlineCode>ctx.agent.subject</InlineCode> (Next),{" "}
          <InlineCode>getRelayAgent(c)</InlineCode> (Hono) or{" "}
          <InlineCode>request.relayAgent</InlineCode> (Fastify).
        </LI>
      </UL>

      <H2 id="local-llm">Local LLMs get no special treatment</H2>
      <P>
        Relay's access control runs entirely server-side. It does not care where the
        LLM is running — cloud API, local container, or on-device model. A local LLM
        must authenticate with the server identically to a cloud model. Same token,
        same scope check, same block list.
      </P>

      <H2 id="future">What&apos;s coming</H2>
      <UL>
        <LI>
          Audit log: immutable record of every consent grant + revoke.
        </LI>
        <LI>
          Chrome extension consent dashboard: user-facing view of who has access to
          what, with one-click revoke.
        </LI>
      </UL>

      <PageNav pathname="/docs/consent" />
    </>
  );
}
