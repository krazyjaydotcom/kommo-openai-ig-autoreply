const assert = require('node:assert/strict');
const { createDurableJobs } = require('./durable-jobs');
async function run() {
  const rows = new Map();
  const request = async (url, options = {}) => {
    const body = options.body && JSON.parse(options.body);
    if (options.method === 'POST') { if (!rows.has(body.id)) rows.set(body.id, { ...body, status: 'pending' }); return; }
    if (!options.method) return [...rows.values()].filter(r => r.status === 'pending' && r.kind === url.match(/kind=eq\.([^&]+)/)[1]);
    if (url.includes('started_at=lt')) return [];
    const id = url.match(/id=eq\.([^&]+)/)[1];
    const row = rows.get(id);
    if (url.includes('status=eq.pending') && row.status !== 'pending') return [];
    Object.assign(row, body);
    return [row];
  };
  let calls = 0;
  const queue = createDurableJobs(request, async () => { calls++; });
  const incoming = { incoming_message_id: '1', talk_id: 'test', event_type: 'message.received' };
  await queue.enqueue(incoming, {});
  await queue.enqueue(incoming, {});
  assert.equal(rows.size, 1);
  await Promise.all([queue.sweep(), queue.sweep()]);
  assert.equal(calls, 1);
  assert.equal([...rows.values()][0].status, 'done');
  const restarted = createDurableJobs(request, async () => { throw new Error('uncertain delivery'); });
  await restarted.enqueue({ ...incoming, incoming_message_id: '2' }, {});
  await restarted.sweep();
  assert.equal([...rows.values()][1].status, 'needs_review');
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const replyQueue = createDurableJobs(request, async () => {
    started();
    await new Promise(resolve => { release = resolve; });
  }, 'reply');
  await replyQueue.enqueue({ ...incoming, incoming_message_id: '3' }, {});
  const waiting = replyQueue.sweep();
  await ready;
  await queue.enqueue({ ...incoming, incoming_message_id: '4' }, {});
  await queue.sweep();
  assert.equal(calls, 2, 'incoming stage progresses while reply stage is delayed');
  release();
  await waiting;
  await restarted.sweep();
  assert.equal([...rows.values()][1].status, 'needs_review');
  console.log('Durable jobs: duplicate, single-flight, restart and ambiguous failure checks passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
