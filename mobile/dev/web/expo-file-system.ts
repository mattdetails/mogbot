/** Web QA stand-in for expo-file-system's new API (see metro.config.js). */
export * from './expo-file-system-legacy';

export enum FileMode {
  ReadOnly = 'r',
  ReadWrite = 'rw',
}

/** Only what a relayed download needs: a `.part` written piece by piece, then moved. */
export class File {
  constructor(public uri: string) {}
  async preview() {}
  get exists() {
    return false;
  }
  create(_opts?: { intermediates?: boolean }) {}
  delete() {}
  open(_mode?: FileMode) {
    return { writeBytes: async (_b: Uint8Array) => {}, close: () => {} };
  }
  move(to: File, _opts?: { overwrite?: boolean }): Promise<void> {
    this.uri = to.uri;
    return Promise.resolve();
  }
}

export class Directory {
  constructor(readonly uri: string) {}
}

export const Paths = { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///documents/' } };
