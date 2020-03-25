export type Embed = object

export interface ChannelInterface {
  send: (text: string, embed?: Embed) => Promise<MessageInterface>;
}

export interface MessageInterface {
  channel: ChannelInterface;
  content: string;
  author: {
    id: string;
  };
}
