import { VisualInterface } from "./Visual";
import { MessageInterface } from "./Message";

export interface ChannelInterface {
  send: (format: VisualInterface) => Promise<MessageInterface>;
}
