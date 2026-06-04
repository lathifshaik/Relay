"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { CodeBlock } from "@/components/ui/CodeBlock";

const EXPRESS_CODE = `import express from "express";
import { middleware, describe } from "@relay/express";

const app = express();
app.use(express.json());
app.use(middleware({ appName: "todo" }));

app.post(
  "/todos",
  describe(
    (req, res) => {
      const todo = { id: \`t_\${Date.now()}\`, title: req.body.title };
      res.relayRespond(todo);
    },
    {
      actionId: "create_todo",
      inputs: { title: { type: "string", required: true, min: 1 } },
      returns: { id: { type: "string" }, title: { type: "string" } },
    },
  ),
);

app.listen(3000);`;

const AGENT_CODE = `# Agent reads the manifest — 200-800 tokens, not 8-40k
$ curl http://localhost:3000/relay/manifest

{
  "relayVersion": "0.1",
  "appName": "todo",
  "actions": [
    {
      "actionId": "create_todo",
      "method": "POST",
      "path": "/todos",
      "inputs": { "title": { "type": "string", "required": true, "min": 1 } },
      "returns": { "id": "string", "title": "string" }
    }
  ]
}

# Agent calls the action — validated, typed, projected
$ curl -X POST http://localhost:3000/relay/act/create_todo \\
    -d '{"inputs":{"title":"ship M2"}}'

{ "id": "t_17...", "title": "ship M2" }`;

export function CodeExample() {
  return (
    <section id="install" className="relative py-28 md:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="mb-4 font-mono text-[12.5px] uppercase tracking-[0.15em] text-[var(--color-accent-bright)]">
            See it
          </p>
          <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            From <span className="font-mono text-[var(--color-fg-muted)]">npm install</span> to
            agent-readable, in fifteen lines.
          </h2>
        </motion.div>

        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 ml-1 font-mono text-[12px] uppercase tracking-[0.2em] text-[var(--color-fg-dim)]">
              You write
            </p>
            <CodeBlock
              filename="server.ts"
              language="ts"
              code={EXPRESS_CODE}
              highlightLines={[2, 6, 10, 14, 15]}
            />
          </div>

          <div className="relative">
            <motion.div
              aria-hidden
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
              className="absolute -left-8 top-1/2 hidden -translate-y-1/2 text-[var(--color-fg-dim)] lg:block"
            >
              <ArrowRight className="h-5 w-5" />
            </motion.div>
            <p className="mb-3 ml-1 font-mono text-[12px] uppercase tracking-[0.2em] text-[var(--color-fg-dim)]">
              Agents see
            </p>
            <CodeBlock filename="agent.sh" language="sh" code={AGENT_CODE} />
          </div>
        </div>
      </div>
    </section>
  );
}
