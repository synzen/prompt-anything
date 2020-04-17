import { Rejection } from './errors/Rejection'
import { EventEmitter } from 'events';
import { PromptResult } from './PromptResult';
import { MessageInterface } from './interfaces/Message';
import { VisualInterface } from './interfaces/Visual';
import { ChannelInterface } from './interfaces/Channel';

export type PromptFunction<DataType, MessageType extends MessageInterface> = (m: MessageType, data: DataType) => Promise<DataType>

export interface PromptCollector<DataType> extends EventEmitter {
  emit(event: 'reject', message: MessageInterface, error: Rejection): boolean;
  emit(event: 'accept', message: MessageInterface, data: DataType): boolean;
  emit(event: 'exit', message: MessageInterface): boolean;
  emit(event: 'inactivity'): boolean;
  emit(event: 'error', error: Error): boolean;
  emit(event: 'message', message: MessageInterface): boolean;
  emit(event: 'stop'): boolean;
  on(event: 'message', listener: (message: MessageInterface) => void): this;
  on(event: 'reject', listener: (message: MessageInterface, error: Rejection) => void): this;
  once(event: 'accept', listener: (message: MessageInterface, data: DataType) => void): this;
  once(event: 'exit', listener: (message: MessageInterface) => void): this;
  once(event: 'inactivity', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'stop', listener: () => void): this;
}

export type VisualGenerator<DataType> = (data: DataType) => Promise<VisualInterface>

export type PromptCondition<DataType> = (data: DataType) => Promise<boolean>

export type StoredMessage = {
  message: MessageInterface;
  fromUser: boolean;
}

export abstract class Prompt<DataType, MessageType extends MessageInterface> {
  /**
   * Create a collector that is part of a prompt
   * 
   * @param channel Channel to create the collector in
   * @param data Prompt data
   */
  abstract createCollector(channel: ChannelInterface<MessageType>, data: DataType): PromptCollector<DataType>;

  /**
   * When a message is rejected, this function is additionally called
   * 
   * @param message Message that was rejected
   * @param error The Rejection error the message caused
   * @param channel The channel of the current prompt
   * @param data The data of the current prompt
   */
  abstract onReject(message: MessageType, error: Rejection, channel: ChannelInterface<MessageType>, data: DataType): Promise<void>;

  /**
   * When the collector expires, call this function
   * @param channel The channel of the current prompt
   * @param data The data of the current prompt
   */
  abstract onInactivity(channel: ChannelInterface<MessageType>, data: DataType): Promise<void>;

  /**
   * When a message specifies it wants to exit the prompt,
   * call this function
   * 
   * @param message The message that triggered the exit
   * @param channel The channel of the current prompt
   * @param data The data of the current prompt
   */
  abstract onExit(message: MessageType, channel: ChannelInterface<MessageType>, data: DataType): Promise<void>;
  visualGenerator: VisualGenerator<DataType>|VisualInterface
  collector?: PromptCollector<DataType>
  readonly duration: number
  readonly messages: Array<StoredMessage> = []
  readonly function?: PromptFunction<DataType, MessageType>
  readonly condition?: PromptCondition<DataType>

  constructor(visualGenerator: VisualGenerator<DataType>|VisualInterface, f?: PromptFunction<DataType, MessageType>, condition?: PromptCondition<DataType>, duration = 0) {
    this.visualGenerator = visualGenerator
    this.duration = duration
    this.function = f
    this.condition = condition
  }

  /**
   * Returns the visual given the data
   * 
   * @param data
   */
  async getVisual (data: DataType): Promise<VisualInterface> {
    if (typeof this.visualGenerator === 'function') {
      return this.visualGenerator(data)
    } else {
      return this.visualGenerator
    }
  }

  /**
   * Handles timeout and messages of a message colllector
   * 
   * @param emitter Message collector
   * @param func Prompt function
   * @param data Prompt data
   * @param duration Duration of collector before it emits inactivity
   */
  static handleCollector<DataType, MessageType extends MessageInterface> (emitter: PromptCollector<DataType>, func: PromptFunction<DataType, MessageType>, data?: DataType, duration?: number): void {
    let timer: NodeJS.Timeout
    if (duration) {
      timer = setTimeout(() => {
        emitter.emit('inactivity')
      }, duration)
    }
    emitter.on('message', async thisMessage => {
      await this.handleMessage(emitter, thisMessage, func, data)
    })
    emitter.once('stop', () => {
      clearTimeout(timer)
    })
  }

  /**
   * Handle each individual message from a collector to determine
   * what event it should emit. Ignores all messages whose author
   * ID does not match the original message.
   * 
   * @param emitter Message collector
   * @param message Collected message
   * @param func Prompt function
   * @param data Prompt data
   */
  static async handleMessage<DataType, MessageType extends MessageInterface> (emitter: PromptCollector<DataType>, message: MessageInterface, func: PromptFunction<DataType, MessageType>, data?: DataType): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      const newData = await func(message, data)
      emitter.emit('accept', message, newData)
    } catch (err) {
      if (err instanceof Rejection) {
        // Don't stop collector since rejects can be tried again
        emitter.emit('reject', message, err)
      } else {
        emitter.emit('error', err)
      }
    }
  }

  /**
   * Send a visual
   * 
   * @param visual The visual for channel.send to send
   * @param channel Channel to send the message to
   */
  async sendVisual (visual: VisualInterface, channel: ChannelInterface<MessageType>): Promise<MessageType> {
    const sent = await channel.send(visual)
    this.storeBotMessage(sent)
    return sent
  }

  /**
   * Send the visual generated by the visual generator
   * 
   * @param message The MessageInterface before this prompt
   * @param data Data to generate the user's message
   */
  async sendUserVisual (channel: ChannelInterface<MessageType>, data: DataType): Promise<MessageInterface> {
    return this.sendVisual(await this.getVisual(data), channel)
  }

  /**
   * Store a message sent by the user into this prompt's store
   * 
   * @param message Message sent by the user
   */
  storeUserMessage (message: MessageInterface): void {
    this.messages.push({
      message,
      fromUser: true
    })
  }

  /**
   * Store a message sent by this prompt into this prompt's store
   * 
   * @param message Message sent by this prompt
   */
  storeBotMessage (message: MessageInterface): void {
    this.messages.push({
      message,
      fromUser: false
    })
  }

  /**
   * Runs the Prompt function for every message collected.
   * Reject when channel send promise rejects.
   * 
   * @param channel The channel to collect from
   * @param data The data before this prompt
   */
  collect (channel: ChannelInterface<MessageType>, data: DataType): Promise<PromptResult<DataType>> {
    return new Promise((resolve, reject) => {
      if (!this.function) {
        resolve(new PromptResult(data))
        return
      }
      this.collector = this.createCollector(channel, data)
      const collector = this.collector
      Prompt.handleCollector(collector, this.function, data, this.duration)

      const handleInternalError = (error: Error): boolean => collector.emit('error', error)
      // Internally handled events
      collector.once('error', (err: Error) => {
        collector.emit('stop')
        reject(err)
      })
      collector.once('accept', (acceptMessage: MessageInterface, acceptData: DataType): void => {
        this.storeUserMessage(acceptMessage)
        collector.emit('stop')
        resolve(new PromptResult(acceptData))
      })
      // User-overridden events
      collector.once('inactivity', (): void => {
        collector.emit('stop')
        this.onInactivity(channel, data)
          .then(() => resolve(new PromptResult(data, true)))
          .catch(handleInternalError)
      })
      collector.once('exit', (exitMessage: MessageInterface) => {
        this.storeUserMessage(exitMessage)
        collector.emit('stop')
        this.onExit(exitMessage as MessageType, channel, data)
          .then(() => resolve(new PromptResult(data, true)))
          .catch(handleInternalError)
      })
      collector.on('reject', (userInput: MessageInterface, err: Rejection): void => {
        this.storeUserMessage(userInput)
        this.onReject(userInput as MessageType, err, channel, data)
          .catch(handleInternalError)
      })
    })
  }
}

