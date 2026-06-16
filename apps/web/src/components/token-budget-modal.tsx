import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { Button, Card } from "./ui";

/**
 * Displays when an AI endpoint returns a TOKEN_BUDGET_EXCEEDED error.
 * The API client dispatches this event on 402/budget failures.
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
    <div className="token-budget-overlay" onClick={() => setVisible(false)}>
      <Card className="token-budget-card" onClick={(event) => event.stopPropagation()}>
        <div className="token-budget-icon">
          <Zap size={24} />
        </div>
        <h2>Free Tier Limit Reached</h2>
        <p>
          You&apos;ve used all your available AI tokens on the free plan. Upgrade to continue using AI-powered features
          like Discover, Refine, Evolve, and Reports.
        </p>
        <div className="token-budget-actions">
          <Button variant="secondary" onClick={() => setVisible(false)}>
            Dismiss
          </Button>
          <Button
            onClick={() => {
              window.open("mailto:support@remorra.io?subject=Upgrade%20to%20Paid%20Tier", "_blank");
              setVisible(false);
            }}
          >
            Upgrade Now
          </Button>
        </div>
      </Card>
    </div>
  );
}
