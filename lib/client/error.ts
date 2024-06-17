export class ConnectionClosed extends Error {
  readonly #className = 'ConnectionClosed';
  constructor() {
    super(`connection closed`);
  }
}

export class ConnectionReset extends Error {
  readonly #className = 'ConnectionReset';
  constructor(message: string) {
    super(message);
  }
}

export class ConnectTimeout extends Error {
  readonly #className = 'ConnectTimeout';
  constructor() {
    super('connect timed out');
  }
}

export class StateIsNotOfflineError extends Error {
  readonly #className = 'StateIsNotOfflineError';
  constructor(message: string) {
    super(`State is not offline: ${message}`);
  }
}

export class StateIsNotOnlineError extends Error {
  readonly #className = 'StateIsNotOnlineError';
  constructor(message: string) {
    super(`State is not online: ${message}`);
  }
}

export class SendPacketError extends Error {
  readonly #className = 'SendPacketError';
  constructor() {
    super(`can't send packet because offline`);
  }
}

export class UnexpectedUrlProtocol extends Error {
  readonly #className = 'UnexpectedUrlProtocolextends';
  constructor(message: string) {
    super(`unexpected URL protcol: ${message}`);
  }
}
