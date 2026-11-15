import { Component } from 'react';

/**
 * Вместо чёрного экрана — текст ошибки и кнопка перезагрузки.
 * В Telegram иначе любой сбой в рендере выглядит как пустое приложение.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('app crashed:', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          padding: 24,
          background: '#0f1115',
          color: '#e9ecf1',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600 }}>Что-то сломалось</div>
        <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75, wordBreak: 'break-word' }}>
          {String(error?.message ?? error)}
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 18,
            height: 42,
            padding: '0 18px',
            border: 0,
            borderRadius: 12,
            background: '#22c55e',
            color: '#000',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Перезагрузить
        </button>
      </div>
    );
  }
}
