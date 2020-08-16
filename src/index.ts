import { EventListenerMap } from './events';

type WebSocketData = string | ArrayBuffer | Blob | ArrayBufferView;

type Options = {
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionAttempts?: number;
  messageQueueSize?: number;
};

type ListenerMap = {
  [type in keyof EventListenerMap]: EventListenerMap[type][];
};

const DEFAULT = {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
  messageQueueSize: Infinity,
};

class StrongSocket {
  private _ws?: WebSocket;

  private readonly _url: string;
  private readonly _protocols?: string | string[];
  private readonly _options: Options;

  private readonly _listeners: ListenerMap = {
    open: [],
    close: [],
    error: [],
    message: [],
  };
  public onopen: EventListenerMap['open'] | null = null;
  public onclose: EventListenerMap['close'] | null = null;
  public onerror: EventListenerMap['error'] | null = null;
  public onmessage: EventListenerMap['message'] | null = null;

  private _retryCount = 0;
  private _connectLock = false;
  private _closeCalled = false;
  private _binaryType: BinaryType = 'blob';
  private _messageQueue: WebSocketData[] = [];

  constructor(
    url: string,
    protocols?: string | string[],
    options: Options = {},
  ) {
    this._url = url;
    this._protocols = protocols;
    this._options = options;
    this._connect();
  }

  get url() {
    return this._url;
  }

  get extensions() {
    return this._ws?.extensions;
  }

  get protocol() {
    return this._ws?.protocol;
  }

  get readyState() {
    return this._ws?.readyState;
  }

  get binaryType() {
    return this._ws ? this._ws.binaryType : this._binaryType;
  }

  set binaryType(value: BinaryType) {
    this._binaryType = value;
    if (this._ws) {
      this._ws.binaryType = value;
    }
  }

  get bufferedAmount(): number {
    const bytes = this._messageQueue.reduce((acc, message) => {
      if (typeof message === 'string') {
        acc += message.length;
      } else if (message instanceof Blob) {
        acc += message.size;
      } else {
        acc += message.byteLength;
      }
      return acc;
    }, 0);
    return bytes + (this._ws ? this._ws.bufferedAmount : 0);
  }

  static get CONNECTING() {
    return 0;
  }

  static get OPEN() {
    return 1;
  }

  static get CLOSING() {
    return 2;
  }

  static get CLOSED() {
    return 3;
  }

  get CONNECTING() {
    return StrongSocket.CONNECTING;
  }

  get OPEN() {
    return StrongSocket.OPEN;
  }

  get CLOSING() {
    return StrongSocket.CLOSING;
  }

  get CLOSED() {
    return StrongSocket.CLOSED;
  }

  addEventListener<T extends keyof EventListenerMap>(
    type: T,
    listener: EventListenerMap[T],
  ) {
    if (this._listeners[type]) {
      // @ts-ignore
      this._listeners[type].push(listener);
    }
  }

  removeEventListener<T extends keyof EventListenerMap>(
    type: T,
    listener: EventListenerMap[T],
  ) {
    if (this._listeners[type]) {
      //@ts-ignore
      this._listeners[type] = this._listeners[type].filter(l => l !== listener);
    }
  }

  dispatchEvent(ev: Event) {
    const listeners = this._listeners[ev.type as keyof ListenerMap];
    if (listeners) {
      for (const listener of listeners) {
        //@ts-ignore
        listener.call(this._ws, ev);
      }
    }
    return true;
  }

  close(code = 1000, reason?: string) {
    this._closeCalled = true;
    this._ws?.close(code, reason);
  }

  send(data: WebSocketData) {
    if (this._ws && this._ws.readyState === StrongSocket.OPEN) {
      this._ws.send(data);
    } else {
      const { messageQueueSize = DEFAULT.messageQueueSize } = this._options;
      if (this._messageQueue.length < messageQueueSize) {
        this._messageQueue.push(data);
      }
    }
  }

  private _connect() {
    if (this._connectLock) {
      return;
    }
    this._connectLock = true;

    const {
      reconnectionAttempts = DEFAULT.reconnectionAttempts,
    } = this._options;

    if (this._retryCount > reconnectionAttempts) {
      return;
    }

    ++this._retryCount;

    this._removeOwnListeners();
    this._wait().then(() => {
      if (this._closeCalled) {
        return;
      }
      this._ws = new WebSocket(this._url, this._protocols);
      this._ws.binaryType = this._binaryType;
      this._connectLock = false;
      this._addOwnListeners();
    });
  }

  private _reconnect(code?: number, reason?: string) {
    this._closeCalled = false;
    this._retryCount = 0;
    if (!this._ws || this._ws.readyState === StrongSocket.CLOSED) {
      this._connect();
    } else {
      this._removeOwnListeners();
      this._ws.close(code, reason);
      this._connect();
    }
  }

  private _getDelay(): number {
    if (this._retryCount === 0) {
      return 0;
    }

    const { reconnectionDelay = DEFAULT.reconnectionDelay } = this._options;
    return reconnectionDelay;
  }

  private _wait(): Promise<void> {
    return new Promise<void>(resolve => {
      setTimeout(resolve, this._getDelay());
    });
  }

  private _handleOpen = (ev: Event) => {
    this._retryCount = 0;
    this._ws!.binaryType = this._binaryType;

    for (const message of this._messageQueue) {
      this._ws?.send(message);
    }
    this._messageQueue = [];

    if (this.onopen) {
      this.onopen.call(this._ws, ev);
    }

    for (const listener of this._listeners.open) {
      listener.call(this._ws, ev);
    }
  };

  private _handleClose = (ev: CloseEvent) => {
    if (this.onclose) {
      this.onclose.call(this._ws, ev);
    }

    for (const listener of this._listeners.close) {
      listener.call(this._ws, ev);
    }

    this._connect();
  };

  private _handleError = (ev: Event) => {
    if (this.onerror) {
      this.onerror.call(this._ws, ev);
    }

    for (const listener of this._listeners.error) {
      listener.call(this._ws, ev);
    }

    this._reconnect();
  };

  private _handleMessage = (ev: MessageEvent) => {
    if (this.onmessage) {
      this.onmessage.call(this._ws, ev);
    }

    for (const listener of this._listeners.message) {
      listener.call(this._ws, ev);
    }
  };

  private _addOwnListeners() {
    if (!this._ws) {
      return;
    }

    this._ws.addEventListener('open', this._handleOpen);
    this._ws.addEventListener('close', this._handleClose);
    this._ws.addEventListener('error', this._handleError);
    this._ws.addEventListener('message', this._handleMessage);
  }

  private _removeOwnListeners() {
    if (!this._ws) {
      return;
    }

    this._ws.removeEventListener('open', this._handleOpen);
    this._ws.removeEventListener('close', this._handleClose);
    this._ws.removeEventListener('error', this._handleError);
    this._ws.removeEventListener('message', this._handleMessage);
  }
}

export default StrongSocket;
