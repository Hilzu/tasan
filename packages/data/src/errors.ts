/** A stored record could not be decoded. Raw records and validation input are private. */
export class DataIntegrityError extends Error {
  constructor(model: string) {
    super(`Invalid stored ${model} record`);
    this.name = "DataIntegrityError";
  }
}
