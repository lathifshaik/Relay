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

export const metadata = { title: "Security · Relay docs" };

const BLOCKED = `// Default blocked patterns — Relay matches these case-insensitively
// against route paths and returns 403 before invoking any handler.

/(^|\\/)bank(\\/|$)/i        // /bank, /api/bank, /bank/transfer
/(^|\\/)payment[s]?(\\/|$)/i // /payment, /payments
/(^|\\/)card[s]?(\\/|$)/i    // /cards, /api/cards
/(^|\\/)admin(\\/|$)/i       // /admin, /api/admin
/(^|\\/)password[s]?(\\/|$)/i
/(^|\\/)pii(\\/|$)/i
/(^|\\/)internal(\\/|$)/i
/(^|\\/)token[s]?(\\/|$)/i
/(^|\\/)secret[s]?(\\/|$)/i`;

const CUSTOM_BLOCK = `import { createBlockList } from "@relay/core";

app.use(middleware({
  appName: "todo",
  blockList: createBlockList(
    [/^\\/internal\\//],         // extra blocks
    [/^\\/admin\\/public$/],     // explicit allow overrides block
  ),
}));`;

const SECRETS = `// Default secret patterns scanned in every outbound response.
// Matches are replaced with [REDACTED] before reaching the agent.

sk-[A-Za-z0-9_-]{20,}                        // OpenAI keys
sk-ant-[A-Za-z0-9_-]{20,}                    // Anthropic keys
AKIA[0-9A-Z]{16}                             // AWS access keys
(sk|pk|rk)_live_[A-Za-z0-9]{20,}             // Stripe live
(sk|pk|rk)_test_[A-Za-z0-9]{20,}             // Stripe test
ghp_[A-Za-z0-9]{36}                          // GitHub tokens
eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+   // JWTs
-----BEGIN [A-Z ]+-----[\\s\\S]+?-----END [A-Z ]+----- // PEM blocks
(postgres|mysql|mongodb|redis):\\/\\/...      // Connection strings
[a-fA-F0-9]{40,}                             // SHA-1+ hex (skips UUIDs)`;

export default function SecurityDocs() {
  return (
    <>
      <DocHeader
        eyebrow="Reference"
        title="Security architecture"
        lead="The LLM sees intent, not infrastructure. Four pipeline stages strip secrets and project only declared output fields before any response reaches an agent."
      />

      <H2 id="threat-model">Threat model</H2>
      <P>
        Relay assumes the agent is untrusted — even if it's running a local model. All
        protection runs server-side. A local LLM has no special privileges and must
        authenticate the same way as a cloud model.
      </P>

      <H2 id="four-stages">The 4-stage sanitisation pipeline</H2>
      <P>
        Every response from <InlineCode>/relay/act</InlineCode> passes through four
        stages before reaching the agent:
      </P>
      <UL>
        <LI>
          <strong>Schema projection</strong> — only fields declared in the action's{" "}
          <InlineCode>returns</InlineCode> map are forwarded. A handler returning a
          40-field DB row with a 3-field schema yields only those 3 fields.
        </LI>
        <LI>
          <strong>Secret pattern scanner</strong> — every string is scanned against known
          credential formats (API keys, JWTs, PEM blocks, connection strings). Matches
          are replaced with <InlineCode>[REDACTED]</InlineCode>.
        </LI>
        <LI>
          <strong>Error sanitisation</strong> — thrown errors are wrapped into{" "}
          <InlineCode>&lbrace; error: "INTERNAL_ERROR" &rbrace;</InlineCode>. Stack
          traces, file paths, and DB error strings never leak.
        </LI>
        <LI>
          <strong>Consent-scoped filtering</strong> — even schema-declared fields can be
          filtered if a per-user consent grant excludes them. (Phase 3.)
        </LI>
      </UL>

      <H2 id="block-list">Default block list</H2>
      <P>
        Routes matching any of these patterns return 403 before the handler runs —
        whether or not they were annotated with <InlineCode>describe()</InlineCode>:
      </P>
      <div className="mt-4">
        <CodeBlock language="ts" code={BLOCKED} />
      </div>

      <H2 id="custom-block">Custom block / allow lists</H2>
      <P>
        Pass <InlineCode>createBlockList(extraBlocks, extraAllows)</InlineCode>. Allow
        rules override block rules, so you can punch precise holes through the defaults.
      </P>
      <div className="mt-4">
        <CodeBlock filename="server.ts" language="ts" code={CUSTOM_BLOCK} />
      </div>

      <H2 id="secret-patterns">Secret patterns</H2>
      <div className="mt-4">
        <CodeBlock language="ts" code={SECRETS} />
      </div>

      <Callout kind="warning" title="False positives">
        The long-hex pattern catches SHA-1+ hashes but skips UUIDs (which contain
        dashes). If you legitimately return long opaque IDs, expect to see them
        redacted. Add an escape via custom <InlineCode>SecretPattern</InlineCode>{" "}
        injection if needed.
      </Callout>

      <H2 id="tokens">Agent tokens</H2>
      <UL>
        <LI>
          <strong>Format</strong> — HS256 JWT signed with Node's built-in{" "}
          <InlineCode>crypto.createHmac</InlineCode>. No external dependencies.
        </LI>
        <LI>
          <strong>Scope</strong> — list of permitted actionIds, or{" "}
          <InlineCode>["*"]</InlineCode> for wildcard.
        </LI>
        <LI>
          <strong>TTL</strong> — default 1 hour, max 30 days.
        </LI>
        <LI>
          <strong>Revocation</strong> — instant via{" "}
          <InlineCode>tokenStore.revoke(jti)</InlineCode>. v0.1 ships{" "}
          <InlineCode>MemoryTokenStore</InlineCode>; Redis/Postgres adapters are
          additive in v0.2.
        </LI>
      </UL>

      <PageNav pathname="/docs/security" />
    </>
  );
}
