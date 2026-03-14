/**
 * React Error Boundary
 * 捕获子组件树中的渲染错误，显示友好的降级 UI
 */

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error('[AQUO] 渲染错误:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 space-y-3">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>界面渲染错误</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              {this.state.errorMessage}
            </AlertDescription>
          </Alert>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
          >
            重试
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
