import { describe, expect, it } from 'vitest';
import { WebhookSink } from '@cockroachdb/cdc';
import { IdeaChangefeedHandler } from './cdc.js';

describe('ideas-board change data capture', () => {
  // tag::cdc-test[]
  // No cluster needed: the handler is pure projection. Dispatch the row images a
  // webhook would carry — an insert, an update, and a null-`after` delete —
  // straight to the handler and assert what it extracts. Then drive the sink with
  // the raw wire bytes to confirm it parses a batch and treats a
  // resolved-timestamp heartbeat as "nothing to dispatch".
  it('projects inserts/updates and counts deletes', async () => {
    const handler = new IdeaChangefeedHandler();
    await handler.handle({ after: { id: 'a', title: 'Dark mode', votes: 3 } });
    await handler.handle({ after: { id: 'a', title: 'Dark mode', votes: 4 }, before: { id: 'a' } });
    await handler.handle({ after: null, before: { id: 'a' } });

    expect(handler.handled()).toHaveLength(2);
    expect(handler.handled()[1].votes).toBe(4);
    expect(handler.deletes()).toBe(1);
  });

  it('parses a batch and skips the resolved heartbeat', async () => {
    const handler = new IdeaChangefeedHandler();
    const sink = new WebhookSink(handler.handle);

    const batch = JSON.stringify({
      payload: [
        { after: { id: 'a', title: 'Dark mode', votes: 3 }, key: ['a'] },
        { after: { id: 'b', title: 'CSV export', votes: 1 }, key: ['b'] },
      ],
      length: 2,
    });
    const out = await sink.handle(undefined, batch);
    expect(out.processed).toBe(2);
    expect(out.resolved).toBe(false);

    const beat = await sink.handle(undefined, '{"resolved":"1700000000.0"}');
    expect(beat.resolved).toBe(true);
    expect(beat.processed).toBe(0);
  });
  // end::cdc-test[]
});
