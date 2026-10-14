export class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
