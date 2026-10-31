/** A subscription is installed before replay so a cursor never races live publication. */
export class ControlStream implements AsyncIterable<unknown> {
  private readonly queue: unknown[] = [];
  private wake?: () => void;
  private closed = false;
  private dispose?: () => void;

  constructor(connect: (push: (event: unknown) => void) => () => void) {
    this.dispose = connect((event) => {
      if (this.closed) return;
      this.queue.push(event);
      this.wake?.();
    });
  }

  close(): void {
    this.closed = true;
    this.dispose?.();
    this.dispose = undefined;
    this.wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    try {
      while (!this.closed) {
        if (this.queue.length) yield this.queue.shift();
        else
          await new Promise<void>((resolve) => {
            this.wake = resolve;
          });
      }
    } finally {
      this.close();
    }
  }
}
