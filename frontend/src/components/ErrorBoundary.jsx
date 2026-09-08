import React from "react";
import Icon from "./Icon";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "var(--sp-6)",
          background: "var(--surface)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
        }}>
          <div style={{
            maxWidth: 520,
            width: "100%",
            background: "var(--surface-raised)",
            border: "1.5px solid var(--border)",
            borderRadius: "var(--r-xl)",
            padding: "var(--sp-8)",
            textAlign: "center",
            boxShadow: "var(--shadow-lg)",
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--danger-bg)",
              display: "grid",
              placeItems: "center",
              margin: "0 auto var(--sp-4)",
            }}>
              <Icon name="alert-circle" size={30} color="var(--danger)" />
            </div>

            <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--sp-2)" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", marginBottom: "var(--sp-6)", lineHeight: 1.6 }}>
              The application encountered an unexpected display issue. Your saved data and bookings are completely safe.
            </p>

            <div style={{ display: "flex", gap: "var(--sp-3)", justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={this.handleReload}
                style={{ gap: 8, fontWeight: 700 }}
              >
                <Icon name="refresh" size={16} />
                <span>Reload Page</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={this.handleGoHome}
                style={{ gap: 8 }}
              >
                <Icon name="home" size={16} />
                <span>Return Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
