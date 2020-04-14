import { VisualInterface } from "./Visual";
import { MessageInterface } from "./Message";

export interface ChannelInterface<MessageType extends MessageInterface> {
  send: (format: VisualInterface) => Promise<MessageType>;
}
