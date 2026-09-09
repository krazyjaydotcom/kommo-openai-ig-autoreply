const crypto = require('crypto');

function createDurableJobs(request, processJob, kind = 'incoming') {
  let running = false;
  return {
    async enqueue(incoming, parsedPayload) {
      const identity = incoming.incoming_message_id
        ? [incoming.zernio_account_id, incoming.talk_id, incoming.event_type, incoming.incoming_message_id]
        : parsedPayload;
      const id = crypto.createHash('sha256').update(JSON.stringify([kind, identity])).digest('hex');
      await request('message_jobs?on_conflict=id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({ id, kind, payload: { incoming, parsedPayload } })
      });
      return id;
    },
    async sweep() {
      if (running) return;
      running = true;
      try {
        // An interrupted external send is ambiguous. Never resend it automatically.
        await request('message_jobs?kind=eq.' + kind + '&status=eq.processing&started_at=lt.' + encodeURIComponent(new Date(Date.now()-15*60000).toISOString()), {
          method: 'PATCH', body: JSON.stringify({ status: 'needs_review', error: 'Processing interrupted; reconcile delivery before retrying.' })
        });
        const jobs = await request('message_jobs?kind=eq.' + kind + '&status=eq.pending&order=created_at.asc&limit=10');
        for (const job of jobs) {
          const route = 'message_jobs?id=eq.' + job.id;
          const claimed = await request(route + '&status=eq.pending', {
            method: 'PATCH', headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ status: 'processing', started_at: new Date().toISOString() })
          });
          if (!claimed.length) continue;
          try {
            await processJob(job.payload);
            await request(route, { method: 'PATCH', body: JSON.stringify({ status: 'done', finished_at: new Date().toISOString() }) });
          } catch (error) {
            await request(route, { method: 'PATCH', body: JSON.stringify({ status: 'needs_review', error: String(error.message).slice(0,1000) }) });
          }
        }
      } finally { running = false; }
    }
  };
}
module.exports = { createDurableJobs };
