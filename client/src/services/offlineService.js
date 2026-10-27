// Enhanced offline service with IndexedDB and background sync
import { collection, addDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

// IndexedDB setup
const DB_NAME = 'SiteSyncDB';
const DB_VERSION = 1;
let dbInstance = null;

// Initialize IndexedDB
const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB error:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create object stores for different data types
      if (!db.objectStoreNames.contains('offlineQueue')) {
        const queueStore = db.createObjectStore('offlineQueue', { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('type', 'type', { unique: false });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('cache')) {
        const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
        cacheStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('photos')) {
        const photoStore = db.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        photoStore.createIndex('workLogId', 'workLogId', { unique: false });
        photoStore.createIndex('dprId', 'dprId', { unique: false });
      }
    };
  });
};

// Queue operations
export const addToOfflineQueue = async (operation) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');

    const queueItem = {
      ...operation,
      timestamp: Date.now(),
      synced: false
    };

    await store.add(queueItem);

    // Also add to localStorage as backup
    const queueKey = `${operation.type}OfflineQueue`;
    const existingQueue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    existingQueue.push(queueItem);
    localStorage.setItem(queueKey, JSON.stringify(existingQueue));

    // Register background sync if available
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-offline-queue');
      } catch (err) {
        console.warn('Background sync not available:', err);
      }
    }

    return queueItem;
  } catch (error) {
    console.error('Error adding to offline queue:', error);
    // Fallback to localStorage
    const queueKey = `${operation.type}OfflineQueue`;
    const existingQueue = JSON.parse(localStorage.getItem(queueKey) || '[]');
    const queueItem = {
      ...operation,
      timestamp: Date.now(),
      synced: false
    };
    existingQueue.push(queueItem);
    localStorage.setItem(queueKey, JSON.stringify(existingQueue));
    return queueItem;
  }
};

// Get offline queue
export const getOfflineQueue = async (type = null) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(['offlineQueue'], 'readonly');
    const store = transaction.objectStore('offlineQueue');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        let items = request.result || [];
        if (type) {
          items = items.filter(item => item.type === type && !item.synced);
        } else {
          items = items.filter(item => !item.synced);
        }
        resolve(items.sort((a, b) => a.timestamp - b.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting offline queue:', error);
    // Fallback to localStorage
    const queues = ['dpr', 'attendance', 'material', 'workLog', 'task'];
    const allItems = [];
    queues.forEach(queueType => {
      const queueKey = `${queueType}OfflineQueue`;
      const items = JSON.parse(localStorage.getItem(queueKey) || '[]');
      items.forEach(item => {
        if (!type || item.type === queueType) {
          allItems.push({ ...item, type: queueType });
        }
      });
    });
    return allItems.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }
};

// Mark queue item as synced
export const markQueueItemSynced = async (itemId) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');

    return new Promise((resolve, reject) => {
      const getRequest = store.get(itemId);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.synced = true;
          item.syncedAt = Date.now();
          store.put(item);
        }
        resolve();
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    console.error('Error marking queue item as synced:', error);
  }
};

// Remove synced items from queue
export const cleanupSyncedItems = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction(['offlineQueue'], 'readwrite');
    const store = transaction.objectStore('offlineQueue');

    return new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.synced) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error cleaning up synced items:', error);
  }
};

// Sync offline queue
export const syncOfflineQueue = async () => {
  if (!navigator.onLine) {
    console.log('[Offline Service] Device is offline, skipping sync');
    return { synced: 0, failed: 0 };
  }

  try {
    const queue = await getOfflineQueue();
    if (queue.length === 0) {
      return { synced: 0, failed: 0 };
    }

    let syncedCount = 0;
    let failedCount = 0;

    for (const item of queue) {
      try {
        // Handle different operation types
        switch (item.type) {
          case 'dpr':
            await addDoc(collection(db, 'dprs'), {
              ...item.data,
              synced: true,
              syncedAt: serverTimestamp()
            });
            break;

          case 'attendance':
            await addDoc(collection(db, 'attendance'), {
              ...item.data,
              synced: true,
              syncedAt: serverTimestamp()
            });
            break;

          case 'material':
            await addDoc(collection(db, 'materialRequests'), {
              ...item.data,
              synced: true,
              syncedAt: serverTimestamp()
            });
            break;

          case 'workLog':
            await addDoc(collection(db, 'workLogs'), {
              ...item.data,
              synced: true,
              syncedAt: serverTimestamp()
            });
            break;

          case 'task':
            if (item.operation === 'update') {
              await setDoc(doc(db, 'tasks', item.taskId), {
                ...item.data,
                synced: true,
                syncedAt: serverTimestamp()
              }, { merge: true });
            } else {
              await addDoc(collection(db, 'tasks'), {
                ...item.data,
                synced: true,
                syncedAt: serverTimestamp()
              });
            }
            break;

          default:
            console.warn('[Offline Service] Unknown operation type:', item.type);
        }

        await markQueueItemSynced(item.id);
        syncedCount++;

        // Also remove from localStorage backup
        const queueKey = `${item.type}OfflineQueue`;
        const localStorageQueue = JSON.parse(localStorage.getItem(queueKey) || '[]');
        const filteredQueue = localStorageQueue.filter(q => q.timestamp !== item.timestamp);
        if (filteredQueue.length > 0) {
          localStorage.setItem(queueKey, JSON.stringify(filteredQueue));
        } else {
          localStorage.removeItem(queueKey);
        }
      } catch (error) {
        console.error(`[Offline Service] Error syncing ${item.type}:`, error);
        failedCount++;
      }
    }

    // Cleanup synced items
    await cleanupSyncedItems();

    console.log(`[Offline Service] Sync complete: ${syncedCount} synced, ${failedCount} failed`);
    return { synced: syncedCount, failed: failedCount };
  } catch (error) {
    console.error('[Offline Service] Error in sync process:', error);
    return { synced: 0, failed: 0 };
  }
};

// Cache data
export const cacheData = async (key, data) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');

    await store.put({
      key,
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error caching data:', error);
  }
};

// Get cached data
export const getCachedData = async (key, maxAge = 3600000) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(['cache'], 'readonly');
    const store = transaction.objectStore('cache');

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => {
        const result = request.result;
        if (result && (Date.now() - result.timestamp) < maxAge) {
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting cached data:', error);
    return null;
  }
};

// Store photo in IndexedDB
export const storePhoto = async (photoFile, workLogId = null, dprId = null) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(['photos'], 'readwrite');
    const store = transaction.objectStore('photos');

    // Convert File to ArrayBuffer
    const arrayBuffer = await photoFile.arrayBuffer();

    const photoData = {
      file: arrayBuffer,
      name: photoFile.name,
      type: photoFile.type,
      size: photoFile.size,
      workLogId,
      dprId,
      timestamp: Date.now()
    };

    return await store.add(photoData);
  } catch (error) {
    console.error('Error storing photo:', error);
    // Fallback to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(photoFile);
    });
  }
};

// Get stored photo
export const getStoredPhoto = async (photoId) => {
  try {
    const db = await initDB();
    const transaction = db.transaction(['photos'], 'readonly');
    const store = transaction.objectStore('photos');

    return new Promise((resolve, reject) => {
      const request = store.get(photoId);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          const blob = new Blob([result.file], { type: result.type });
          resolve(blob);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting stored photo:', error);
    return null;
  }
};

// Initialize offline service
export const initOfflineService = () => {
  // Initialize IndexedDB
  initDB().catch(err => {
    console.warn('IndexedDB initialization failed, using localStorage fallback:', err);
  });

  // Listen for online event
  window.addEventListener('online', async () => {
    console.log('[Offline Service] Connection restored, syncing offline data...');
    
    // Notify all components
    window.dispatchEvent(new CustomEvent('online', { detail: { timestamp: Date.now() } }));
    
    // Sync offline queue
    const result = await syncOfflineQueue();
    
    // Notify sync complete
    window.dispatchEvent(new CustomEvent('offlineSyncComplete', { 
      detail: { 
        synced: result.synced, 
        failed: result.failed 
      } 
    }));
  });

  // Listen for offline event
  window.addEventListener('offline', () => {
    console.log('[Offline Service] Connection lost, entering offline mode');
    window.dispatchEvent(new CustomEvent('offline', { detail: { timestamp: Date.now() } }));
  });

  // Periodic sync check (every 30 seconds when online)
  setInterval(() => {
    if (navigator.onLine) {
      syncOfflineQueue();
    }
  }, 30000);
};
