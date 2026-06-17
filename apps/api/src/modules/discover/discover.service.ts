import { BadRequestException, Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileTypeFromBuffer } from "file-type";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { CryptoService } from "../../infrastructure/crypto.service.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { EventRouterService } from "../event-router/event-router.service.js";

const execFileAsync = promisify(execFile);

@Injectable()
export class DiscoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly access: ProjectAccessService,
    private readonly eventRouter: EventRouterService,
  ) {}

  async start(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder"]);
    return this.prisma.client.conversation.create({
      data: {
        projectId,
        kind: "discover",
        retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async latest(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder"]);
    const session = await this.prisma.client.conversation.findFirst({
      where: { projectId, kind: "discover" },
      orderBy: { updatedAt: "desc" },
    });
    return session ? this.get(session.id, userId) : null;
  }

  async get(id: string, userId: string) {
    const session = await this.prisma.client.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } }, extracts: true },
    });
    if (!session) return null;
    await this.access.require(session.projectId, userId, ["founder"]);
    return {
      ...session,
      messages: session.messages.map((message: any) => ({
        ...message,
        encryptedContent: undefined,
        content: this.crypto.decrypt(message.encryptedContent),
      })),
    };
  }

  async message(id: string, userId: string, content: string) {
    const session = await this.prisma.client.conversation.findUniqueOrThrow({
      where: { id },
    });
    await this.access.require(session.projectId, userId, ["founder"]);
    await this.prisma.client.conversationMessage.create({
      data: {
        conversationId: id,
        actorId: userId,
        role: "user",
        encryptedContent: this.crypto.encrypt(content),
        skillId: null,        // discover phase uses event routing — skill not pinned here
        skillVersionId: null,
      },
    });
    const jobs = await this.eventRouter.route({
      eventType: "conversation_message.create",
      projectId: session.projectId,
      userId,
      idempotencyKey: `discover-message:${id}:${this.crypto.encrypt(content).slice(-16)}`,
      payload: {
        phase: "discover",
        conversationId: id,
        content,
      },
    });
    return jobs[0] ?? null;
  }

  async extract(id: string, userId: string) {
    const session = await this.prisma.client.conversation.findUniqueOrThrow({
      where: { id },
    });
    await this.access.require(session.projectId, userId, ["founder"]);
    const jobs = await this.eventRouter.route({
      eventType: "structured_extract.create",
      projectId: session.projectId,
      userId,
      idempotencyKey: `discover-extract:${id}`,
      payload: {
        phase: "discover",
        conversationId: id,
        extractType: "founder-pack",
      },
    });
    return jobs[0] ?? null;
  }

  async confirmExtract(id: string, extractId: string, userId: string) {
    const session = await this.prisma.client.conversation.findUniqueOrThrow({
      where: { id },
    });
    await this.access.require(session.projectId, userId, ["founder"]);
    const extract = await this.prisma.client.structuredExtract.findFirstOrThrow({
      where: { id: extractId, conversationId: id },
    });
    if (extract.confirmedAt) {
      return this.prisma.client.founderPack.findFirstOrThrow({
        where: { projectId: session.projectId },
        orderBy: { version: "desc" },
      });
    }
    return this.prisma.client.$transaction(async (tx: any) => {
      const latest = await tx.founderPack.findFirst({
        where: { projectId: session.projectId },
        orderBy: { version: "desc" },
      });
      const pack = await tx.founderPack.create({
        data: {
          projectId: session.projectId,
          version: (latest?.version ?? 0) + 1,
          content: extract.payload,
          confirmedAt: new Date(),
        },
      });
      await tx.structuredExtract.update({
        where: { id: extract.id },
        data: { confirmedAt: new Date() },
      });
      await tx.conversation.update({
        where: { id },
        data: { status: "completed" },
      });
      return pack;
    });
  }

  async upload(
    id: string,
    userId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException("A PDF or DOCX file is required.");
    const session = await this.prisma.client.conversation.findUniqueOrThrow({
      where: { id },
    });
    await this.access.require(session.projectId, userId, ["founder"]);
    const detected = await fileTypeFromBuffer(file.buffer);
    const isPdf = detected?.mime === "application/pdf";
    const isDocx =
      detected?.mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      detected?.ext === "docx";
    if (!isPdf && !isDocx) {
      throw new BadRequestException(
        "The uploaded content is not a valid PDF or DOCX file.",
      );
    }
    if (
      isDocx &&
      file.buffer.includes(Buffer.from("word/vbaProject.bin", "utf8"))
    ) {
      throw new BadRequestException("Macro-enabled documents are not allowed.");
    }
    await this.scanUpload(file.buffer, file.originalname);
    let text = "";
    if (isPdf) {
      const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
      try {
        text = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    } else {
      text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
    }
    const cleaned = text.replace(/\0/g, "").trim().slice(0, 120_000);
    if (!cleaned) {
      throw new BadRequestException("No readable text was found in the file.");
    }
    const safeName =
      file.originalname.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) ||
      `upload.${isPdf ? "pdf" : "docx"}`;
    await this.prisma.client.conversationMessage.create({
      data: {
        conversationId: id,
        actorId: userId,
        role: "user",
        encryptedContent: this.crypto.encrypt(
          `[Uploaded document: ${safeName}]\n${cleaned}`,
        ),
        skillId: null,
        skillVersionId: null,
      },
    });
    return {
      filename: safeName,
      mimeType: detected?.mime,
      extractedCharacters: cleaned.length,
      originalRetained: false,
    };
  }

  private async scanUpload(buffer: Buffer, originalName: string) {
    const command = process.env.UPLOAD_SCANNER_COMMAND;
    if (!command) return;
    const directory = await mkdtemp(join(tmpdir(), "remorra-upload-"));
    const safeName =
      originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) ||
      "upload.bin";
    const filePath = join(directory, safeName);
    try {
      await writeFile(filePath, buffer);
      await execFileAsync(command, [filePath], {
        timeout: Number(process.env.UPLOAD_SCANNER_TIMEOUT_MS ?? 15_000),
        windowsHide: true,
      });
    } catch {
      throw new BadRequestException("The uploaded file failed security scanning.");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
