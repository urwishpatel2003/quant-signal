// src/components/ErrorBoundary.jsx
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[QuAInt Error]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#07070e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'IBM Plex Mono, monospace',
          padding: '24px'
        }}>
          <div style={{
            background: '#0f0f1a',
            border: '1px solid #2a2a40',
            borderRadius: '8px',
            padding: '40px',
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '36px', marginBottom: '16px' }}>⚠</div>
            <div style={{
              color: '#ffaa00',
              fontSize: '11px',
              letterSpacing: '2px',
              marginBottom: '12px'
            }}>SYSTEM ERROR</div>
            <div style={{
              color: '#e8e8f0',
              fontSize: '14px',
              marginBottom: '8px'
            }}>Something went wrong</div>
            <div style={{
              color: '#7788aa',
              fontSize: '12px',
              marginBottom: '28px'
            }}>
              {this.state.error?.message || 'Unexpected error occurred'}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                background: '#ffaa00',
                color: '#07070e',
                border: 'none',
                borderRadius: '4px',
                padding: '10px 24px',
                fontSize: '12px',
                fontFamily: 'IBM Plex Mono, monospace',
                letterSpacing: '1px',
                cursor: 'pointer',
                marginRight: '8px'
              }}
            >TRY AGAIN</button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'transparent',
                color: '#b0c0dd',
                border: '1px solid #2a2a40',
                borderRadius: '4px',
                padding: '10px 24px',
                fontSize: '12px',
                fontFamily: 'IBM Plex Mono, monospace',
                letterSpacing: '1px',
                cursor: 'pointer'
              }}
            >RELOAD</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}