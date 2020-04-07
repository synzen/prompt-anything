export type Format = {
  text: string;
}

export interface ChannelInterface {
  send: (format: Format) => Promise<MessageInterface>;
}

export interface MessageInterface {
  content: string;
}
