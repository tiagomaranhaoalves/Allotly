import { Component, type ErrorInfo, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] p-6" data-testid="error-boundary">
          <Card className="max-w-md w-full p-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground" data-testid="text-error-title">
                Something went wrong
              </h2>
              <p className="text-sm text-muted-foreground" data-testid="text-error-description">
                An unexpected error occurred while rendering this page. Please try again.
              </p>
            </div>
            <Button onClick={this.handleReset} data-testid="button-try-again">
              Try Again
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
