import { EventListenerMap } from "./events";

type Options = {
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionAttempts?: number;
};

type ListenerMap = {
  [type in keyof EventListenerMap]: EventListenerMap[type][];
};

const DEFAULT_OPTIONS: Options = {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity,
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
  public onopen: EventListenerMap["open"] | null = null;
  public onclose: EventListenerMap["close"] | null = null;
  public onerror: EventListenerMap["error"] | null = null;
  public onmessage: EventListenerMap["message"] | null = null;

  private _retryCount = 0;

  constructor(
    url: string,
    protocols?: string | string[],
    options: Options = {}
  ) {
    this._url = url;
    this._protocols = protocols;
    this._options = Object.assign(DEFAULT_OPTIONS, options);
    this._connect();
  }

  addEventListener<T extends keyof EventListenerMap>(
    type: T,
    listener: EventListenerMap[T]
  ) {
    this._listeners[type].push(listener);
  }

  private _connect() {
    if (this._retryCount > this._options.reconnectionAttempts) {
      return;
    }

    this._wait().then(() => {
      this._ws = new WebSocket(this._url, this._protocols);
      this._addListeners();
    });
  }

  private _getDelay(): number {
    if (this._retryCount === 0) return 0;
    return this._options.reconnectionDelay;
  }

  private _wait(): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, this._getDelay());
    });
  }

  private _handleOpen(ev: Event) {
    if (this.onopen) {
      this.onopen.call(this._ws, ev);
    }

    for (const listener of this._listeners.open) {
      listener.call(this._ws, ev);
    }
  }

  private _handleClose(ev: CloseEvent) {
    if (this.onclose) {
      this.onclose.call(this._ws, ev);
    }

    for (const listener of this._listeners.close) {
      listener.call(this._ws, ev);
    }
  }

  private _handleError(ev: ErrorEvent) {
    if (this.onerror) {
      this.onerror.call(this._ws, ev);
    }

    for (const listener of this._listeners.error) {
      listener.call(this._ws, ev);
    }
  }

  private _handleMessage(ev: MessageEvent) {
    if (this.onmessage) {
      this.onmessage.call(this._ws, ev);
    }

    for (const listener of this._listeners.message) {
      listener.call(this._ws, ev);
    }
  }

  private _addListeners() {
    this._ws.addEventListener("open", this._handleOpen.bind(this));
    this._ws.addEventListener("close", this._handleClose.bind(this));
    this._ws.addEventListener("error", this._handleError.bind(this));
    this._ws.addEventListener("message", this._handleMessage.bind(this));
  }
}

export default StrongSocket;
