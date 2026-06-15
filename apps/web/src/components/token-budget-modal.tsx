import { useState, useEffect } from "react";

/**
 * TokenBudgetModal — Displays when an AI endpoint returns TOKEN_BUDGET_EXCEEDED error.
 * Listens for a custom event dispatched by the API client on 402/budget errors.
 */
export function TokenBudgetModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener("token-budget-exceeded", handler);
    return () => window.removeEventListener("token-budget-exceeded", handler);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="token-budget-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={() => setVisible(false)}
    >
      <div
        className="token-budget-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface, #1a2420)",
          border: "1px solid var(--accent, #23694a)",
          borderRadius: 16,
          padding: "32px 28px",
          maxWidth: 440,
          width: "90%",
          textAlign: "center",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #23694a, #1a4a33)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: 28,
          }}
        >
          ⚡
        </div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary, #e8f0eb)",
            margin: "0 0 8px",
          }}
        >
          Free Tier Limit Reached
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-secondary, #8ca296)",
            lineHeight: 1.6,
            margin: "0 0 24px",
          }}
        >
          You've used all your available AI tokens on the free plan.
          Upgrade to continue using AI-powered features like Discover, Refine,
          Evolve, and Reports.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={() => setVisible(false)}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "1px solid var(--border, #2a3a30)",
              background: "transparent",
              color: "var(--text-secondary, #8ca296)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              // For now, link to a contact/upgrade flow
              window.open("mailto:support@remorra.io?subject=Upgrade%20to%20Paid%20Tier", "_blank");
              setVisible(false);
            }}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg, #23694a, #2d8a5e)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: 0.3,
            }}
          >
            Upgrade Now
          </button>
        </div>
      </div>
    </div>
  );
}
