import { Component, type ReactNode } from 'react';

// Error boundary for additive UI widgets. Anything new that decorates a
// working flow (build theater, preview sheets, etc.) mounts inside one of
// these so a widget crash degrades to the plain fallback instead of taking
// the screen down — a prior editor widget once broke preview for 3 days.
export class SafeWidget extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
