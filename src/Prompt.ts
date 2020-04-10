import { Rejection } from './errors/Rejection'
import { TreeNode } from './TreeNode';
import { MessageInterface, ChannelInterface, VisualInterface } from './types/generics';
import { EventEmitter } from 'events';

export type PromptFunction<T> = (this: Prompt<T>, m: MessageInterface, data: T) => Promise<T>

export interface PromptCollector<T> extends EventEmitter {
  emit(event: 'reject', message: MessageInterface, error: Rejection): boolean;
  emit(event: 'accept', message: MessageInterface, data: T): boolean;
  emit(event: 'exit', message: MessageInterface): boolean;
  emit(event: 'inactivity'): boolean;
  emit(event: 'error', error: Error): boolean;
  emit(event: 'message', message: MessageInterface): boolean;
  emit(event: 'stop'): boolean;
  on(event: 'message', listener: (message: MessageInterface) => void): this;
  on(event: 'reject', listener: (message: MessageInterface, error: Rejection) => void): this;
  once(event: 'accept', listener: (message: MessageInterface, data: T) => void): this;
  once(event: 'exit', listener: (message: MessageInterface) => void): this;
  once(event: 'inactivity', listener: () => void): this;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'stop', listener: () => void): this;
}

export type VisualGenerator<T> = (data: T) => VisualInterface

export type PromptCondition<T> = (data: T) => Promise<boolean>;

export type StoredMessage = {
  message: MessageInterface;
  fromUser: boolean;
}

export abstract class Prompt<T> extends TreeNode<Prompt<T>> {
  /**
   * Create a collector that is part of a prompt
   * 
   * @param channel Channel to create the collector in
   * @param data Prompt data
   */
  abstract createCollector(channel: ChannelInterface, data: T): PromptCollector<T>;

  /**
   * When a message is rejected, this function is additionally called
   * 
   * @param message Message that was rejected
   * @param error The Rejection error the message caused
   * @param channel The channel of the current prompt
   * @param data The data of the current prompt
   */
  abstract onReject(message: MessageInterface, error: Rejection, channel: ChannelInterface, data: T): Promise<void>;

  /**
   * When the collector expires, call this function
   * @param channel The channel of the current prompt
   * @param data The data of the current prompt
   */
  abstract onInactivity(channel: ChannelInterface, data: T): Promise<void>;

  /**
   * When a message specifies it wants to exit the prompt,
   * call this function
   * 
   * @param message The message that triggered the exit
   * @param channel The channel of the current prompt
   * @param data The data of the current prompt
   */
  abstract onExit(message: MessageInterface, channel: ChannelInterface, data: T): Promise<void>;
  visualGenerator: VisualGenerator<T>|VisualInterface
  collector?: PromptCollector<T>
  readonly duration: number
  readonly messages: Array<StoredMessage> = []
  readonly function?: PromptFunction<T>
  readonly condition?: PromptCondition<T>

  constructor(visualGenerator: VisualGenerator<T>|VisualInterface, f?: PromptFunction<T>, condition?: PromptCondition<T>, duration = 0) {
    super()
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
  getVisual (data: T): VisualInterface {
    if (typeof this.visualGenerator === 'function') {
      return this.visualGenerator(data)
    } else {
      return this.visualGenerator
    }
  }

  /**
   * Asserts that the children of this prompt are valid.
   * If a phase has 2 or more children, then they must all
   * all have condition functions specified.
   */
  hasValidChildren (): boolean {
    const children = this.children
    if (children.length <= 1) {
      return true
    }
    // There are more 2 or more children - they must have conditions
    for (const child of children) {
      if (!child.condition) {
        return false
      }
    }
    return true
  }

  /**
   * Handles timeout and messages of a message colllector
   * 
   * @param emitter Message collector
   * @param func Prompt function
   * @param data Prompt data
   * @param duration Duration of collector before it emits inactivity
   */
  static handleCollector<T> (emitter: PromptCollector<T>, func: PromptFunction<T>, data?: T, duration?: number): void {
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
  static async handleMessage<T> (emitter: PromptCollector<T>, message: MessageInterface, func: PromptFunction<T>, data?: T): Promise<void> {
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
   * Send a message
   * 
   * @param visual The visual for channel.send to send
   * @param channel Channel to send the message to
   */
  async sendMessage (visual: VisualInterface, channel: ChannelInterface): Promise<MessageInterface> {
    const sent = await channel.send(visual)
    this.storeBotMessage(sent)
    return sent
  }

  /**
   * Send the message visual generated by the visual generator
   * 
   * @param message The MessageInterface before this prompt
   * @param data Data to generate the user's message
   */
  async sendUserVisualMessage (channel: ChannelInterface, data: T): Promise<MessageInterface> {
    return this.sendMessage(this.getVisual(data), channel)
  }

  /**
   * Set all children to empty so there is no next prompt.
   */
  terminateHere (): void {
    this.setChildren([])
  }

  /**
   * Determine what the next prompt is given a message and data.
   * 
   * @param data The data before this prompt
   */
  async getNext (data: T): Promise<Prompt<T>|null> {
    const { children } = this
    for (let i = 0; i < children.length; ++i) {
      const child = children[i]
      if (!child.condition || await child.condition(data)) {
        return child
      }
    }
    return null
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
  collect (channel: ChannelInterface, data: T): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.function) {
        resolve(data)
        return
      }
      this.collector = this.createCollector(channel, data)
      const collector = this.collector
      Prompt.handleCollector(collector, this.function.bind(this), data, this.duration)

      const handleInternalError = (error: Error): boolean => collector.emit('error', error)
      // Internally handled events
      collector.once('error', (err: Error) => {
        collector.emit('stop')
        this.terminateHere()
        reject(err)
      })
      collector.once('accept', (acceptMessage: MessageInterface, acceptData: T): void => {
        this.storeUserMessage(acceptMessage)
        collector.emit('stop')
        resolve(acceptData)
      })
      // User-overridden events
      collector.once('inactivity', (): void => {
        collector.emit('stop')
        this.terminateHere()
        this.onInactivity(channel, data)
          .then(() => resolve(data))
          .catch(handleInternalError)
      })
      collector.once('exit', (exitMessage: MessageInterface) => {
        this.storeUserMessage(exitMessage)
        collector.emit('stop')
        this.terminateHere()
        this.onExit(exitMessage, channel, data)
          .then(() => resolve(data))
          .catch(handleInternalError)
      })
      collector.on('reject', (userInput: MessageInterface, err: Rejection): void => {
        this.storeUserMessage(userInput)
        this.onReject(userInput, err, channel, data)
          .catch(handleInternalError)
      })
    })
  }
}

