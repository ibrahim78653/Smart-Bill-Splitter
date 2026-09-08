import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  public handleReload = () => {
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-red-100 shadow-xl p-6 max-w-md w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink-900">Something went wrong</h2>
              <p className="text-sm text-ink-500 mt-1">
                {this.state.error?.message || 'An unexpected error occurred while rendering this page.'}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 btn-ghost border border-stone-200 py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              >
                <RefreshCw size={15} />
                Try Again
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 shadow-sm"
              >
                <Home size={15} />
                Go Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
