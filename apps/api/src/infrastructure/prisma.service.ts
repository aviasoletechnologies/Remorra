import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@remorra/database";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor() {
    this.client = createPrismaClient();
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  transaction<T>(
    callback: Parameters<PrismaClient["$transaction"]>[0],
  ): Promise<T> {
    return this.client.$transaction(callback as never) as Promise<T>;
  }
}
