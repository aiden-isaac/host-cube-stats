import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  // type: 'success', 'error', 'info', 'warning'
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type, hiding: false }]);

    if (duration) {
      setTimeout(() => removeToast(id), duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, hiding: true } : t))
    );
    // Actually remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.hiding ? 'hiding' : ''}`}>
            <ToastIcon type={toast.type} />
            <div style={{ flex: 1, fontSize: '0.9rem', color: '#fff' }}>
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastIcon({ type }) {
  switch(type) {
    case 'success': return <CheckCircle size={20} color="#10b981" />;
    case 'error': return <AlertTriangle size={20} color="#ef4444" />;
    case 'warning': return <AlertTriangle size={20} color="#f59e0b" />;
    default: return <Info size={20} color="#3b82f6" />;
  }
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
