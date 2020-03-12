import { MessageInterface, Embed, PhaseCollectorInterface } from './discord'

export type PhaseReturnData<T> = {
  data?: T;
  message: MessageInterface;
}

export type PhaseFunction<T> = (m: MessageInterface, data?: T) => Promise<T>

export type PhaseCollectorCreator<T> = (message: MessageInterface, func: PhaseFunction<T>, data?: T, duration?: number) => PhaseCollectorInterface

export type Format = {
  text?: string;
  embed?: Embed;
}

export type FormatGenerator<T> = (m: MessageInterface, data?: T) => Format

export type PhaseCondition<T> = (m: MessageInterface, data?: T) => Promise<boolean>;
