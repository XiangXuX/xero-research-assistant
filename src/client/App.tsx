import { useEffect, useState } from "react";

import type { HealthResponse } from "../shared/contracts.js";

type ConnectionState = "checking" | "connected" | "unavailable";

export function App() {
  const [connection, setConnection] = useState<ConnectionState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkApi() {
      try {
        const response = await fetch("/api/health", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const body = (await response.json()) as HealthResponse;
        setConnection(body.status === "ok" ? "connected" : "unavailable");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setConnection("unavailable");
        }
      }
    }

    void checkApi();
    return () => controller.abort();
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Evidence-grounded company research</p>
        <h1>Xero Research Assistant</h1>
        <p className="description">
          Gather public Xero research, ask questions, and trace every factual
          answer back to stored evidence.
        </p>
        <div className={`status status--${connection}`} role="status">
          <span className="status__dot" aria-hidden="true" />
          API {connection}
        </div>
      </section>

      <section className="placeholder" aria-label="Development status">
        <h2>Project foundation ready</h2>
        <p>
          Research gathering, evidence retrieval, and grounded answers will be
          added in the next milestones.
        </p>
      </section>
    </main>
  );
}
