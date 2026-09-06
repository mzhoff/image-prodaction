export class RuntimeV2Error extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = 'RuntimeV2Error';
    this.code = code;
    this.status = status;
  }
}
