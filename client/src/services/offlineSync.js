// Offline sync service for handling queue synchronization
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const syncOfflineQueue = async (queueKey, collectionName) => {
  if (!navigator.onLine) return;

  const queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
  if (queue.length === 0) return;

  const syncedItems = [];
  const failedItems = [];

  for (const item of queue) {
    try {
      await addDoc(collection(db, collectionName), {
        ...item,
        synced: true,
        syncedAt: new Date().toISOString()
      });
      syncedItems.push(item);
    } catch (error) {
      console.error(`Error syncing ${queueKey}:`, error);
      failedItems.push(item);
    }
  }

  // Update queue with only failed items
  if (failedItems.length > 0) {
    localStorage.setItem(queueKey, JSON.stringify(failedItems));
  } else {
    localStorage.removeItem(queueKey);
  }

  return { synced: syncedItems.length, failed: failedItems.length };
};

// Listen for online event and sync all queues
export const initOfflineSync = () => {
  window.addEventListener('online', () => {
    console.log('Connection restored. Syncing offline data...');
    // Sync all queues
    syncOfflineQueue('dprOfflineQueue', 'dprs');
    syncOfflineQueue('attendanceOfflineQueue', 'attendance');
    syncOfflineQueue('materialOfflineQueue', 'materialRequests');
  });
};

