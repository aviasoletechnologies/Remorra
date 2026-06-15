import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Card } from "./ui";

interface State {
  error: Error | null;
}

export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page render failed", {
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <Card className="empty-state">
          <h1>This page could not load</h1>
          <p>{this.state.error.message}</p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </Card>
      </div>
    );
  }
}
