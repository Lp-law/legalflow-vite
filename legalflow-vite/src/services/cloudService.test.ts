import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  listBackups,
  createBackup,
  restoreBackup,
  deleteBackup,
  UnauthorizedError,
} from './cloudService';

const TOKEN = 'test-token-abc';
const BASE = 'https://test.example.com';

beforeEach(() => {
  vi.stubEnv('VITE_LEGALFLOW_API_URL', BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const mockFetchResponse = (body: unknown, init: { status?: number } = {}) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: (init.status ?? 200) >= 200 && (init.status ?? 200) < 300,
    status: init.status ?? 200,
    statusText: 'OK',
    text: () => Promise.resolve(text),
  } as unknown as Response;
};

describe('cloudService snapshots', () => {
  describe('listBackups', () => {
    it('GETs /api/v1/snapshots with bearer token and unwraps the snapshots field', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockFetchResponse({
          snapshots: [
            { id: '2026-05-01T10:00:00.000Z', createdAt: '2026-05-01T10:00:00.000Z', label: null, transactionCount: 12 },
          ],
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await listBackups(TOKEN);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/api/v1/snapshots`);
      expect((options as RequestInit).method).toBeUndefined(); // GET = default
      expect((options as RequestInit).headers).toMatchObject({
        Authorization: `Bearer ${TOKEN}`,
      });
      expect(result).toHaveLength(1);
      expect(result[0].transactionCount).toBe(12);
    });

    it('throws UnauthorizedError on 401 (so app can clear session)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(mockFetchResponse({ error: 'Invalid credentials' }, { status: 401 }))
      );
      await expect(listBackups(TOKEN)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws generic Error on 500', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(mockFetchResponse({ error: 'boom' }, { status: 500 }))
      );
      await expect(listBackups(TOKEN)).rejects.toThrow('boom');
    });
  });

  describe('createBackup', () => {
    it('POSTs to /api/v1/snapshots with label + source body', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockFetchResponse({
          id: '2026-05-01T10:00:00.000Z',
          createdAt: '2026-05-01T10:00:00.000Z',
          label: 'before tax run',
          source: 'manual',
          transactionCount: 17,
          trimmedCount: 0,
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await createBackup(TOKEN, { label: 'before tax run' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/api/v1/snapshots`);
      expect((options as RequestInit).method).toBe('POST');
      expect(JSON.parse(String((options as RequestInit).body))).toEqual({
        label: 'before tax run',
        source: 'manual',
      });
      expect(result.transactionCount).toBe(17);
      expect(result.label).toBe('before tax run');
    });

    it('defaults label to null and source to manual', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockFetchResponse({ id: 'x', createdAt: 'x', label: null, source: 'manual', transactionCount: 0, trimmedCount: 0 })
      );
      vi.stubGlobal('fetch', fetchMock);

      await createBackup(TOKEN);

      const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
      expect(body).toEqual({ label: null, source: 'manual' });
    });

    it('passes through auto source when caller specifies it', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockFetchResponse({ id: 'x', createdAt: 'x', label: null, source: 'auto', transactionCount: 0, trimmedCount: 0 })
      );
      vi.stubGlobal('fetch', fetchMock);

      await createBackup(TOKEN, { source: 'auto' });

      const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
      expect(body.source).toBe('auto');
    });
  });

  describe('restoreBackup', () => {
    it('POSTs to /api/v1/snapshots/:id/restore with URL-encoded id', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockFetchResponse({
          ok: true,
          restoredFrom: '2026-05-01T10:00:00.000Z',
          safetySnapshotId: '2026-05-01T11:00:00.000Z',
          transactionCount: 22,
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await restoreBackup(TOKEN, '2026-05-01T10:00:00.000Z');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/api/v1/snapshots/${encodeURIComponent('2026-05-01T10:00:00.000Z')}/restore`);
      expect((options as RequestInit).method).toBe('POST');
      expect(result.transactionCount).toBe(22);
      expect(result.safetySnapshotId).toBe('2026-05-01T11:00:00.000Z');
    });

    it('throws on 404 (snapshot not found)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(mockFetchResponse({ error: 'Snapshot not found' }, { status: 404 }))
      );
      await expect(restoreBackup(TOKEN, 'missing-id')).rejects.toThrow('Snapshot not found');
    });
  });

  describe('deleteBackup', () => {
    it('DELETEs /api/v1/snapshots/:id', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockFetchResponse({ ok: true }));
      vi.stubGlobal('fetch', fetchMock);

      await deleteBackup(TOKEN, '2026-05-01T10:00:00.000Z');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE}/api/v1/snapshots/${encodeURIComponent('2026-05-01T10:00:00.000Z')}`);
      expect((options as RequestInit).method).toBe('DELETE');
    });
  });

  describe('auth guards', () => {
    it('listBackups rejects without token', async () => {
      await expect(listBackups('')).rejects.toThrow('Missing auth token');
    });
    it('createBackup rejects without token', async () => {
      await expect(createBackup('')).rejects.toThrow('Missing auth token');
    });
    it('restoreBackup rejects without token', async () => {
      await expect(restoreBackup('', 'id')).rejects.toThrow('Missing auth token');
    });
    it('deleteBackup rejects without token', async () => {
      await expect(deleteBackup('', 'id')).rejects.toThrow('Missing auth token');
    });
  });

  describe('env validation', () => {
    it('throws a helpful error if VITE_LEGALFLOW_API_URL is missing', async () => {
      vi.stubEnv('VITE_LEGALFLOW_API_URL', '');
      await expect(listBackups(TOKEN)).rejects.toThrow('VITE_LEGALFLOW_API_URL');
    });
  });
});
