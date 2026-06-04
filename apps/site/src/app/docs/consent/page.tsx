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
relayAccess: "consent-required"  // requires explicit user consent grant (Phase 3)`;

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
        lead="Relay is built consent-first. Site owners control which routes exist in the manifest; end users will control which actions an agent can call on their behalf."
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
          <strong>User consent</strong> — controlled by the end user. Ships in Phase 3;
          v0.1 enforces the first two tiers and a token scope check.
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

      <H2 id="local-llm">Local LLMs get no special treatment</H2>
      <P>
        Relay's access control runs entirely server-side. It does not care where the
        LLM is running — cloud API, local container, or on-device model. A local LLM
        must authenticate with the server identically to a cloud model. Same token,
        same scope check, same block list.
      </P>

      <H2 id="future">What's coming in Phase 3</H2>
      <UL>
        <LI>
          User consent flow: agents requesting access trigger a consent screen showing
          which actions, what data, expiry.
        </LI>
        <LI>
          Scoped grants: user can approve <InlineCode>list_transactions</InlineCode> but
          decline <InlineCode>export_pii</InlineCode>.
        </LI>
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
