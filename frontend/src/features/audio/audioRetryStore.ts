import type { PendingAudioChunk } from './types';

const DB_NAME = 'dev-interview-audio';
const STORE_NAME = 'pending-audio-chunks';
const DB_VERSION = 1;

const hasIndexedDb = () => typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const openDatabase = (): Promise<IDBDatabase | null> =>
  new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir IndexedDB.'));
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore) => Promise<T>,
): Promise<T> => {
  const db = await openDatabase();
  if (!db) {
    throw new Error('IndexedDB indisponivel.');
  }

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let resultValue: T;

    transaction.oncomplete = () => {
      db.close();
      resolve(resultValue);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Falha na transacao IndexedDB.'));
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error || new Error('Transacao IndexedDB abortada.'));
    };

    handler(store)
      .then((result) => {
        resultValue = result;
      })
      .catch((error) => {
        try {
          transaction.abort();
        } catch {}
        db.close();
        reject(error);
      });
  });
};

const requestToPromise = <T = unknown>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao acessar IndexedDB.'));
  });

export const savePendingAudioChunk = async (chunk: PendingAudioChunk): Promise<void> => {
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.put(chunk));
  });
};

export const listPendingAudioChunks = async (): Promise<PendingAudioChunk[]> =>
  withStore('readonly', async (store) => {
    const items = (await requestToPromise(store.getAll())) as PendingAudioChunk[];
    return items.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  });

export const removePendingAudioChunk = async (id: string): Promise<void> => {
  await withStore('readwrite', async (store) => {
    await requestToPromise(store.delete(id));
  });
};

export const incrementPendingAudioChunkAttempts = async (id: string): Promise<void> => {
  await withStore('readwrite', async (store) => {
    const current = (await requestToPromise(store.get(id))) as PendingAudioChunk | undefined;
    if (!current) return;
    await requestToPromise(
      store.put({
        ...current,
        attempts: Number(current.attempts || 0) + 1,
      }),
    );
  });
};

export const countPendingAudioChunks = async (): Promise<number> => {
  try {
    const pending = await listPendingAudioChunks();
    return pending.length;
  } catch {
    return 0;
  }
};
