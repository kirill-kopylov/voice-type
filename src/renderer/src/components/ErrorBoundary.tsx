import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
    this.setState({ info: info.componentStack ?? '' })
  }

  reset = (): void => {
    this.setState({ error: null, info: '' })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="h-screen flex items-center justify-center p-8">
        <div
          className="max-w-lg rounded-xl p-6 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        >
          <h2 className="text-lg font-semibold">Что-то пошло не так</h2>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>{this.state.error.message}</p>
          {this.state.info && (
            <pre className="text-[10px] max-h-40 overflow-auto p-2 rounded" style={{ background: 'var(--bg-root)', color: 'var(--text-3)' }}>
              {this.state.info}
            </pre>
          )}
          <button
            onClick={this.reset}
            className="px-4 py-2 text-sm rounded-lg"
            style={{ background: 'var(--accent-bg-hover)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
          >
            Попробовать снова
          </button>
        </div>
      </div>
    )
  }
}
