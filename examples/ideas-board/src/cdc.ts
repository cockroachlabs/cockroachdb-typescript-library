import { operationOf, type EventHandler, type Payload } from '@cockroachdb/cdc';
import type { Idea } from './service.js';

// tag::cdc-handler[]
/**
 * Projects changefeed row changes into `Idea`s. Inserts and updates are kept as
 * the new row image; deletes are counted. `EventHandler` is just a
 * `(payload) => Promise<void>` function, so this class exposes `handle` as a
 * bound arrow you pass straight to a `WebhookSink`.
 */
export class IdeaChangefeedHandler {
  private readonly ideas: Idea[] = [];
  private deleteCount = 0;

  /** The bound `EventHandler` to hand to a `WebhookSink`. */
  readonly handle: EventHandler = async (payload: Payload): Promise<void> => {
    if (operationOf(payload) === 'delete') {
      this.deleteCount += 1;
      return;
    }
    this.ideas.push(ideaFromAfter(payload));
  };

  /** Ideas projected from insert/update events, in arrival order. */
  handled(): readonly Idea[] {
    return this.ideas;
  }

  /** How many delete events were seen. */
  deletes(): number {
    return this.deleteCount;
  }
}

/** Builds an `Idea` from a payload's `after` row image. */
function ideaFromAfter(payload: Payload): Idea {
  const after = payload.after as Record<string, unknown> | null | undefined;
  if (!after) throw new Error("changefeed row missing 'after' image");
  return {
    id: String(after.id),
    title: String(after.title),
    votes: Number(after.votes ?? 0),
  };
}
// end::cdc-handler[]
