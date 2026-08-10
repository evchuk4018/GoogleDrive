export type DomainErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_NAME"
  | "CONFLICT"
  | "INVALID_PARENT"
  | "UPLOAD_LIMIT_EXCEEDED"
  | "STORAGE_ERROR";

/** Base error used by domain and adapter boundaries. */
export class DriveDomainError extends Error {
  readonly code: DomainErrorCode;
  readonly status: number;

  constructor(code: DomainErrorCode, message: string, status: number) {
    super(message);
    this.name = "DriveDomainError";
    this.code = code;
    this.status = status;
  }
}

export class ValidationError extends DriveDomainError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends DriveDomainError {
  constructor(itemId: string) {
    super("NOT_FOUND", `Drive item ${itemId} was not found`, 404);
    this.name = "NotFoundError";
  }
}

export class DuplicateNameError extends DriveDomainError {
  readonly parentId: string | null;
  readonly itemName: string;

  constructor(name: string, parentId: string | null) {
    const location = parentId ? `folder ${parentId}` : "the Drive root";
    super("DUPLICATE_NAME", `An item named "${name}" already exists in ${location}`, 409);
    this.name = "DuplicateNameError";
    this.parentId = parentId;
    this.itemName = name;
  }
}

export class ConflictError extends DriveDomainError {
  readonly itemId: string;
  readonly expectedEtag?: string;
  readonly currentEtag?: string;

  constructor(itemId: string, expectedEtag?: string, currentEtag?: string) {
    super("CONFLICT", `Drive item ${itemId} changed before this operation completed`, 409);
    this.name = "ConflictError";
    this.itemId = itemId;
    this.expectedEtag = expectedEtag;
    this.currentEtag = currentEtag;
  }
}

export class InvalidParentError extends DriveDomainError {
  constructor(parentId: string, message = `Parent ${parentId} is not an active folder`) {
    super("INVALID_PARENT", message, 400);
    this.name = "InvalidParentError";
  }
}

export class UploadLimitError extends DriveDomainError {
  readonly maxBytes: number;
  readonly actualBytes?: number;

  constructor(maxBytes: number, actualBytes?: number) {
    const suffix = actualBytes === undefined ? "" : ` (received ${actualBytes} bytes)`;
    super("UPLOAD_LIMIT_EXCEEDED", `Upload exceeds the ${maxBytes}-byte limit${suffix}`, 413);
    this.name = "UploadLimitError";
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
  }
}

export class StorageSafetyError extends DriveDomainError {
  constructor(message: string) {
    super("STORAGE_ERROR", message, 500);
    this.name = "StorageSafetyError";
  }
}

export function isDriveDomainError(error: unknown): error is DriveDomainError {
  return error instanceof DriveDomainError;
}
