import { Controller, Get, MessageEvent, Param, Post, Sse } from "@nestjs/common";
import { interval, map, switchMap } from "rxjs";
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

  @Sse("events/stream")
  events(@CurrentActor() actor: Actor) {
    return interval(2000).pipe(
      switchMap(() => this.jobs.recent(actor.userId)),
      map((jobs): MessageEvent => ({ data: { type: "jobs", jobs } })),
    );
  }
}
