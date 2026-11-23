import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { createStore, del, get, set } from 'idb-keyval'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24 * 7, // manter em cache 7 dias para consulta offline
      retry: (n, e) => n < 2 && !/JWT|permission|FORBIDDEN/i.test(String((e as Error)?.message)),
      networkMode: 'offlineFirst',
      refetchOnWindowFocus: true,
    },
    mutations: { networkMode: 'always' },
  },
})

const idb = createStore('lar-cache', 'queries')
// Os dados carregados ficam guardados no dispositivo (IndexedDB) para consulta sem internet.
export const persister = createAsyncStoragePersister({
  storage: { getItem: (k) => get(k, idb), setItem: (k, v) => set(k, v, idb), removeItem: (k) => del(k, idb) },
  key: 'lar-v1',
  throttleTime: 1500,
})

export async function clearLocalCache() {
  queryClient.clear()
  await del('lar-v1', idb)
}
