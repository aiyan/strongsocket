export type EventListenerMap = {
  open: (ev: Event) => any;
  close: (ev: CloseEvent) => any;
  error: (ev: ErrorEvent) => any;
  message: (ev: MessageEvent) => any;
};
