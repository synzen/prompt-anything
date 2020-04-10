export interface VisualInterface {
  text: string;
}

export interface ChannelInterface {
  send: (format: VisualInterface) => Promise<MessageInterface>;
}

export interface MessageInterface {
  content: string;
}
