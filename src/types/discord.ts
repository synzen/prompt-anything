import { Rejection } from "../errors/Rejection"
import { PhaseData } from "./phase"
import { EventEmitter } from "events"

export type Embed = object

export interface PhaseCollectorInterface extends EventEmitter {
  emit(event: 'reject', message: MessageInterface, error: Rejection): boolean;
  emit(event: 'accept', message: MessageInterface, data: PhaseData): boolean;
  emit(event: 'exit', message: MessageInterface): boolean;
  emit(event: 'inactivity'): boolean;
  emit(event: 'error', message: MessageInterface, error: Error): boolean;
  on(event: 'reject', listener: (message: MessageInterface, error: Rejection) => void): this;
  once(event: 'accept', listener: (message: MessageInterface, data: PhaseData) => void): this;
  once(event: 'exit', listener: (message: MessageInterface) => void): this;
  once(event: 'inactivity', listener: () => void): this;
  once(event: 'error', listener: (message: MessageInterface, error: Error) => void): this;
}

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
