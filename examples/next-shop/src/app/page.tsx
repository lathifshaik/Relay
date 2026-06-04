export default function Page() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 720 }}>
      <h1>next-shop · Relay demo</h1>
      <p>
        This Next.js App Router app exposes three actions to AI agents via the
        Relay protocol.
      </p>
      <h2>Try the agent surface</h2>
      <pre style={{ background: "#f6f6f6", padding: 16, fontSize: 13 }}>
{`# Action graph
curl http://localhost:3001/relay/manifest

# Run an action
curl -X POST http://localhost:3001/relay/act/add_to_cart \\
  -H 'Content-Type: application/json' \\
  -d '{"inputs":{"product_id":"p_1","quantity":2}}'

curl -X POST http://localhost:3001/relay/act/get_cart -d '{}'`}
      </pre>
    </main>
  );
}
