export type EventListenerMap = {
  open: (ev: Event) => any;
  close: (ev: CloseEvent) => any;
  error: (ev: Event) => any;
  message: (ev: MessageEvent) => any;
};
