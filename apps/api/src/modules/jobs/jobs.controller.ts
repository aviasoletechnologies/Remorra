import { Controller, Get, MessageEvent, Param, Post, Sse, Query } from "@nestjs/common";
import { interval, map, switchMap, Observable } from "rxjs";
import { CurrentActor, type Actor } from "../../shared/request-context.js";
import { JobsService } from "./jobs.service.js";

@Controller()
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get("jobs")
  recent(@CurrentActor() actor: Actor) {
    return this.jobs.recent(actor.userId);
  }

  @Get("jobs/:id")
  get(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.jobs.get(id, actor.userId);
  }

  @Post("jobs/:id/retry")
  retry(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.jobs.retry(id, actor.userId);
  }

  @Sse("jobs/:id/stream")
  stream(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
  ) {
    return interval(500).pipe(
      switchMap(() => this.jobs.get(id, actor.userId)),
      map((job): MessageEvent => ({
        data: {
          type: "job",
          job,
          done: ["completed", "failed", "cancelled"].includes(job.status),
        },
      })),
    );
  }

  @Sse("jobs/:id/tokens/stream")
  tokensStream(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Query("after") afterQuery?: string,
  ) {
    let lastSentSequence = afterQuery ? Number(afterQuery) : 0;
    let isDone = false;

    return new Observable<MessageEvent>((subscriber) => {
      let timerId: NodeJS.Timeout;

      const poll = async () => {
        try {
          const events = await this.jobs.getStreamEvents(
            id,
            actor.userId,
            lastSentSequence,
            100,
          );

          for (const event of events) {
            lastSentSequence = event.sequence;
            subscriber.next({
              data: {
                sequence: event.sequence,
                type: event.type,
                delta: event.delta,
                snapshot: event.snapshot,
                metadata: event.metadata,
                createdAt: event.createdAt,
              },
            });

            if (["completed", "failed"].includes(event.type)) {
              isDone = true;
            }
          }

          if (isDone) {
            subscriber.complete();
            return;
          }

          timerId = setTimeout(poll, 200);
        } catch (err) {
          subscriber.error(err);
        }
      };

      poll();

      return () => {
        clearTimeout(timerId);
      };
    });
  }

  @Sse("events/stream")
  events(@CurrentActor() actor: Actor) {
    return interval(2000).pipe(
      switchMap(() => this.jobs.recent(actor.userId)),
      map((jobs): MessageEvent => ({ data: { type: "jobs", jobs } })),
    );
  }
}
