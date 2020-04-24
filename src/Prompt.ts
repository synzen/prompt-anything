import { Rejection } from './errors/Rejection'
import { EventEmitter } from 'events';
import { PromptResult } from './PromptResult';
import { MessageInterface } from './interfaces/Message';
import { VisualInterface } from './interfaces/Visual';
import { ChannelInterface } from './interfaces/Channel';

export type PromptFunction<DataType, MessageType extends MessageInterface> = (m: MessageType, data: DataType) => Promise<DataType>

export interface PromptCollector<DataType, MessageType> extends EventEmitter {
  emit(event: 'reject', message: MessageType, error: Rejection): boolean;
  emit(event: 'accept', message: MessageType, data: DataType): boolean;
  emit(event: 'exit', message: MessageType): boolean;
  emit(event: 'inactivity'): boolean;
  emit(event: 'error', error: Error): boolean;
  emit(event: 'message', message: MessageType): boolean;
  emit(event: 'stop'): boolean;
  on(event: 'message', listener: (message: MessageType) => void): this;
  on(event: 'reject', listener: (message: MessageType, error: Rejection) => void): this;
  once(event: 'accept', listener: (message: MessageType, data: DataType) => void): this;
  once(event: 'exit', listener: (message: MessageType) => void): this;
  once(event: 'inactivity', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'stop', listener: () => void): this;
}

export type VisualGenerator<DataType> = (data: DataType) => Promise<VisualInterface|VisualInterface[]>

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
  abstract createCollector(channel: ChannelInterface<MessageType>, data: DataType): PromptCollector<DataType, MessageType>;

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
  messages: Array<StoredMessage> = []
  readonly duration: number
  readonly visualGenerator: VisualGenerator<DataType>|VisualInterface
  readonly function?: PromptFunction<DataType, MessageType>

  constructor(visualGenerator: VisualGenerator<DataType>|VisualInterface, f?: PromptFunction<DataType, MessageType>, duration = 0) {
    this.visualGenerator = visualGenerator
    this.duration = duration
    this.function = f
  }

  /**
   * Returns the visual given the data
   * 
   * @param data
   */
  async getVisual (data: DataType): Promise<VisualInterface|VisualInterface[]> {
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
  static handleCollector<DataType, MessageType extends MessageInterface> (emitter: PromptCollector<DataType, MessageType>, func: PromptFunction<DataType, MessageType>, data?: DataType, duration?: number): void {
    let timer: NodeJS.Timeout
    if (duration) {
      timer = setTimeout(() => {
        emitter.emit('inactivity')
      }, duration)
    }
    emitter.on('message', async (thisMessage: MessageType) => {
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
  static async handleMessage<DataType, MessageType extends MessageInterface> (emitter: PromptCollector<DataType, MessageType>, message: MessageType, func: PromptFunction<DataType, MessageType>, data?: DataType): Promise<void> {
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
  async sendVisual (visual: VisualInterface|VisualInterface[], channel: ChannelInterface<MessageType>): Promise<MessageType|MessageType[]> {
    if (Array.isArray(visual)) {
      const sent = []
      for (const v of visual) {
        const message = await channel.send(v)
        this.storeBotMessage(message)
        sent.push(message)
      }
      return sent
    } else {
      const sent = await channel.send(visual)
      this.storeBotMessage(sent)
      return sent
    }
  }

  /**
   * Send the visual generated by the visual generator
   * 
   * @param message The MessageInterface before this prompt
   * @param data Data to generate the user's message
   */
  async sendUserVisual (channel: ChannelInterface<MessageType>, data: DataType): Promise<MessageType|MessageType[]> {
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
      const collector = this.createCollector(channel, data)
      Prompt.handleCollector(collector, this.function, data, this.duration)

      const handleInternalError = (error: Error): boolean => collector.emit('error', error)
      // Internally handled events
      collector.once('error', (err: Error) => {
        collector.emit('stop')
        reject(err)
      })
      collector.once('accept', (acceptMessage: MessageType, acceptData: DataType): void => {
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
      collector.once('exit', (exitMessage: MessageType) => {
        this.storeUserMessage(exitMessage)
        collector.emit('stop')
        this.onExit(exitMessage, channel, data)
          .then(() => resolve(new PromptResult(data, true)))
          .catch(handleInternalError)
      })
      collector.on('reject', (userInput: MessageType, err: Rejection): void => {
        this.storeUserMessage(userInput)
        this.onReject(userInput, err, channel, data)
          .catch(handleInternalError)
      })
    })
  }

  /**
   * Send the user's visual and start collecting messages
   * 
   * @param channel The channel to collect from
   * @param data Data before this prompt
   */
  async run (channel: ChannelInterface<MessageType>, data: DataType): Promise<PromptResult<DataType>> {
    await this.sendUserVisual(channel, data)
    return this.collect(channel, data)
  }
}

