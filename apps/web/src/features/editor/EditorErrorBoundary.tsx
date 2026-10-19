import { Component, Fragment, type ReactNode } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';

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
        <div className="panel-empty" role="alert">
          <AlertCircle size={24} strokeWidth={1.3} />
          <h3>Could not open the editor</h3>
          <p>Your workspace is still available. Try opening the editor again.</p>
          <button
            className="secondary-button"
            onClick={() => this.setState(({ retry }) => ({ failed: false, retry: retry + 1 }))}
          >
            <RotateCw size={13} />
            Retry editor
          </button>
        </div>
      );
    return <Fragment key={this.state.retry}>{this.props.children}</Fragment>;
  }
}
