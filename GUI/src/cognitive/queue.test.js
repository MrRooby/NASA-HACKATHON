import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api.js';
import { enqueue, flushQueue, pendingCount, rejectedItems, resetQueueMemory, startAutoFlush, submitSession } from './engine/queue.js';

const session = id => ({ client_session_uuid: id, test_id: 'pvt', trials: [] });
const net = () => new ApiError('Cannot reach MOTHER', { kind: 'network' });
const http = (status, msg = 'x') => new ApiError(msg, { kind: 'http', status });

afterEach(() => { resetQueueMemory(); vi.restoreAllMocks(); });

describe('offline queue', () => {
  it('MOTHER unreachable -> the session is queued (and survives in localStorage)', async () => {
    const post = vi.fn().mockRejectedValue(net());
    const r = await submitSession(session('u1'), { post });
    expect(r.state).toBe('queued');
    expect(pendingCount()).toBe(1);
    expect(JSON.parse(window.localStorage.getItem('cognitive.queue.v1'))[0].id).toBe('u1');
  });

  it('503 (database down) also queues', async () => {
    const r = await submitSession(session('u2'), { post: vi.fn().mockRejectedValue(http(503)) });
    expect(r.state).toBe('queued');
  });

  it('201 on first send, nothing is queued', async () => {
    const r = await submitSession(session('u3'), { post: vi.fn().mockResolvedValue({ duplicate: false }) });
    expect(r.state).toBe('sent');
    expect(pendingCount()).toBe(0);
  });

  it('flush removes entries on success and on 200 duplicate (both resolve)', async () => {
    enqueue(session('a')); enqueue(session('b'));
    const post = vi.fn()
      .mockResolvedValueOnce({ duplicate: false })
      .mockResolvedValueOnce({ duplicate: true });
    expect(await flushQueue({ post })).toEqual({ sent: 2, rejected: 0, remaining: 0 });
    expect(pendingCount()).toBe(0);
  });

  it('422 moves the entry to the rejected list and is never retried', async () => {
    enqueue(session('bad')); enqueue(session('good'));
    const post = vi.fn(async p => { if (p.client_session_uuid === 'bad') throw http(422, 'duplicate idx'); return {}; });
    const r = await flushQueue({ post });
    expect(r).toMatchObject({ sent: 1, rejected: 1, remaining: 0 });
    expect(rejectedItems().map(x => x.id)).toEqual(['bad']);
    await flushQueue({ post });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('a network error stops the flush and keeps the rest', async () => {
    enqueue(session('a')); enqueue(session('b'));
    const post = vi.fn().mockRejectedValue(net());
    expect((await flushQueue({ post })).remaining).toBe(2);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('re-queuing the same uuid does not duplicate the entry', () => {
    enqueue(session('same')); enqueue(session('same'));
    expect(pendingCount()).toBe(1);
  });

  it('full storage (QuotaExceededError): data stays in memory and the caller is told', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const r = await submitSession(session('q'), { post: vi.fn().mockRejectedValue(net()) });
    expect(r).toMatchObject({ state: 'queued', persisted: false });
    expect(pendingCount()).toBe(1);
    const post = vi.fn().mockResolvedValue({});
    await flushQueue({ post });
    expect(post).toHaveBeenCalledTimes(1);
    expect(pendingCount()).toBe(0);
  });

  it('unreadable storage does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => pendingCount()).not.toThrow();
  });

  it("flushes when the browser comes back 'online'", async () => {
    enqueue(session('o'));
    const post = vi.fn().mockRejectedValueOnce(net()).mockResolvedValue({});
    const stop = startAutoFlush({ post, intervalMs: 1e9 });
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 30)); // let the first flush settle
    expect(pendingCount()).toBe(1);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(pendingCount()).toBe(0));
    stop();
  });
});
