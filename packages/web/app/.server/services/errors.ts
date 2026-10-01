export type ApplicationErrorCode = "not_found" | "forbidden" | "invalid_input";

export class ApplicationError extends Error {
  constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
