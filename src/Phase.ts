import { Rejection } from './errors/Rejection'
import { TreeNode } from './TreeNode';
import { MessageInterface, PhaseCollectorInterface, Embed } from './types/discord';

export type PhaseReturnData<T> = {
  data?: T;
  message: MessageInterface;
}

export type PhaseFunction<T> = (this: Phase<T>, m: MessageInterface, data?: T) => Promise<T>

export type PhaseCollectorCreator<T> = (
  message: MessageInterface,
  func: PhaseFunction<T>,
  data?: T,
  duration?: number
) => PhaseCollectorInterface<T>

export type Format = {
  text?: string;
  embed?: Embed;
}

export type FormatGenerator<T> = (m: MessageInterface, data?: T) => Format

export type PhaseCondition<T> = (m: MessageInterface, data?: T) => Promise<boolean>;


export class Phase<T> extends TreeNode<Phase<T>> {
  formatGenerator: FormatGenerator<T>
  readonly duration: number
  readonly messages: Array<MessageInterface> = []
  readonly function?: PhaseFunction<T>
  readonly condition?: PhaseCondition<T>
  public static STRINGS = {
    exit: `Menu has been closed.`,
    inactivity: 'Menu has been closed due to inactivity.',
    rejected: `That is not a valid input. Try again.`
  }

  constructor(formatGenerator: FormatGenerator<T>, f?: PhaseFunction<T>, condition?: PhaseCondition<T>, duration = 60000) {
    super()
    this.formatGenerator = formatGenerator
    this.duration = duration
    this.function = f
    this.condition = condition
  }

  /**
   * Send the text and embed for this phase.
   * 
   * @param message - The MessageInterface before this phase
   */
  async sendMessage (message: MessageInterface, data?: T): Promise<MessageInterface|null> {
    const { channel } = message
    const { text, embed } = this.formatGenerator(message, data)
    if (text) {
      return channel.send(text, embed)
    } else if (embed) {
      return channel.send('', embed)
    }
    return null
  }

  /**
   * Set all children to empty so there is no next phase.
   */
  terminateHere (): void {
    this.setChildren([])
  }

  /**
   * Determine what the next phase is given a message and data.
   * 
   * @param message - The MessageInterface before this phase
   * @param data - The data before this phase
   */
  async getNext (message: MessageInterface, data?: T): Promise<Phase<T>|null> {
    const { children } = this
    for (let i = 0; i < children.length; ++i) {
      const child = children[i]
      if (!child.condition || await child.condition(message, data)) {
        return child
      }
    }
    return null
  }

  storeMessage (message: MessageInterface): void {
    this.messages.push(message)
  }

  /**
   * Runs the Phase function for every message collected.
   * Reject when channel send promise rejects.
   * 
   * @param message - The MessageInterface before this phase
   * @param data - The data before this phase
   */
  collect (message: MessageInterface, createCollector: PhaseCollectorCreator<T>, data?: T): Promise<PhaseReturnData<T>> {
    const channel = message.channel
    return new Promise((resolve, reject) => {
      if (!this.function) {
        resolve({
          message,
          data
        })
        return
      }
      const collector = createCollector(message, this.function.bind(this), data, this.duration)

      const terminate = async (terminateString: string): Promise<void> => {
        this.terminateHere()
        const sent = await channel.send(terminateString)
        this.storeMessage(sent)
        resolve({
          message: sent,
          data
        })
      }

      collector.once('error', (lastUserInput: MessageInterface, err: Error) => {
        this.storeMessage(lastUserInput)
        reject(err)
      })
      collector.once('inactivity', (): void => {
        terminate(Phase.STRINGS.inactivity)
          .catch(reject)
      })
      collector.once('exit', (exitMessage: MessageInterface) => {
        this.storeMessage(exitMessage)
        terminate(Phase.STRINGS.exit)
          .catch(reject)
      })
      collector.once('accept', (acceptMessage: MessageInterface, acceptData: T): void => {
        this.storeMessage(acceptMessage)
        resolve({
          message: acceptMessage,
          data: acceptData
        })
      })
      collector.on('reject', (userInput: MessageInterface, err: Rejection): void => {
        this.storeMessage(userInput)
        const invalidFeedback = err.message || Phase.STRINGS.rejected
        channel.send(invalidFeedback)
          .then(m => this.storeMessage(m))
          .catch(reject)
      })
    })
  }
}

