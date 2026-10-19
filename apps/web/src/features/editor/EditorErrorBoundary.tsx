import { AlertCircle, RotateCw } from 'lucide-react';
import { Component, Fragment, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

export class EditorErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; retry: number }
> {
  state = { failed: false, retry: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <EmptyState
          role="alert"
          icon={AlertCircle}
          iconSize={24}
          title="Could not open the editor"
          description="Your workspace is still available. Try opening the editor again."
        >
          <Button
            onClick={() => this.setState(({ retry }) => ({ failed: false, retry: retry + 1 }))}
          >
            <RotateCw size={13} />
            Retry editor
          </Button>
        </EmptyState>
      );
    return <Fragment key={this.state.retry}>{this.props.children}</Fragment>;
  }
}
