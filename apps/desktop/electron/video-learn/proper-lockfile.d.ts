/** Narrow typing for the existing proper-lockfile dependency. */
declare module "proper-lockfile" {
  const lockfile: {
    lock(
      file: string,
      options: {
        lockfilePath?: string;
        retries?: { retries: number; minTimeout: number; maxTimeout: number };
        stale?: number;
        update?: number;
      },
    ): Promise<() => Promise<void>>;
  };
  export default lockfile;
}
