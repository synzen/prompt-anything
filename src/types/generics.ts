export type FormatInterface = {
  text: string;
}

export interface ChannelInterface {
  send: (format: FormatInterface) => Promise<MessageInterface>;
}

export interface MessageInterface {
  content: string;
}
