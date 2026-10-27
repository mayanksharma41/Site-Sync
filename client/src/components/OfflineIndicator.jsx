import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';

const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [showSyncStatus, setShowSyncStatus] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowSyncStatus(true);
      setTimeout(() => setShowSyncStatus(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleSyncComplete = (event) => {
      const { synced, failed } = event.detail;
      if (synced > 0) {
        setPendingSync(prev => Math.max(0, prev - synced));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offlineSyncComplete', handleSyncComplete);

    // Check for pending items
    const checkPendingSync = async () => {
      try {
        const { getOfflineQueue } = await import('../services/offlineService');
        const queue = await getOfflineQueue();
        setPendingSync(queue.length);
      } catch (error) {
        // Fallback to localStorage
        const queues = ['dpr', 'attendance', 'material', 'workLog', 'task'];
        let total = 0;
        queues.forEach(type => {
          const queueKey = `${type}OfflineQueue`;
          const items = JSON.parse(localStorage.getItem(queueKey) || '[]');
          total += items.length;
        });
        setPendingSync(total);
      }
    };

    checkPendingSync();
    const interval = setInterval(checkPendingSync, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offlineSyncComplete', handleSyncComplete);
      clearInterval(interval);
    };
  }, []);

  if (isOnline && !showSyncStatus && pendingSync === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1rem',
        right: '1rem',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.875rem',
        fontWeight: '500',
        backgroundColor: isOnline
          ? (showSyncStatus ? '#10b981' : '#ffffff')
          : '#ef4444',
        color: isOnline && !showSyncStatus ? '#374151' : '#ffffff',
        border: isOnline && !showSyncStatus ? '1px solid #e5e7eb' : 'none',
        transition: 'all 0.3s ease',
        animation: showSyncStatus ? 'slideIn 0.3s ease' : 'none'
      }}
    >
      {isOnline ? (
        <>
          {showSyncStatus ? (
            <>
              <span>✓</span>
              <span>{t('common.synced') || 'Synced'}</span>
            </>
          ) : pendingSync > 0 ? (
            <>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#f59e0b',
                animation: 'pulse 2s infinite'
              }}></span>
              <span>{pendingSync} {t('common.pending') || 'pending'}</span>
            </>
          ) : null}
        </>
      ) : (
        <>
          <span>⚠</span>
          <span>{t('common.offline') || 'Offline'}</span>
          {pendingSync > 0 && (
            <span style={{ marginLeft: '0.5rem', opacity: 0.8 }}>
              ({pendingSync} {t('common.pending') || 'pending'})
            </span>
          )}
        </>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};

export default OfflineIndicator;
