// If any component throws while rendering, React unmounts the whole page and leaves it blank.
// This boundary shows the error instead, so a crash is reportable rather than a white screen
// (found the hard way in M1: "after I clicked Join, the webpage turned white").
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="card">
        <h1>Something broke</h1>
        <p>The page hit an error. Reloading usually helps; if it doesn't, send this to the developer:</p>
        <pre className="crash">{`${error.name}: ${error.message}\n\n${error.stack ?? ""}`}</pre>
        <button onClick={() => location.reload()}>Reload</button>
      </main>
    );
  }
}
