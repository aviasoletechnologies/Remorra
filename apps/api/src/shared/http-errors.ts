import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

export function notFound(entity: string, id: string): never {
  throw new NotFoundException({
    code: "not_found",
    message: `${entity} ${id} was not found`,
  });
}

export function forbidden(message: string): never {
  throw new ForbiddenException({ code: "forbidden", message });
}

export function versionConflict(currentVersion: number): never {
  throw new ConflictException({
    code: "version_conflict",
    message: "The record changed since it was loaded.",
    details: { currentVersion },
  });
}
