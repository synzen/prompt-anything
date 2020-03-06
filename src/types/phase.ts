import { MessageInterface, Embed, PhaseCollectorInterface } from './discord'

export type PhaseData = Record<string, unknown>

export type PhaseReturnData = {
  data: PhaseData;
  message: MessageInterface;
}

export type PhaseFunction = (m: MessageInterface, data: PhaseData) => Promise<PhaseData>

export type PhaseCollectorCreator = (message: MessageInterface, func: PhaseFunction, data: PhaseData, duration: number) => PhaseCollectorInterface

export type Format = {
  text?: string;
  embed?: Embed;
}

export type FormatGenerator = (m: MessageInterface, data: PhaseData) => Format

export interface PhaseValidation {
  (m: MessageInterface, data: PhaseData): boolean;
}

export type PhaseCondition = (m: MessageInterface, data: PhaseData) => boolean;
