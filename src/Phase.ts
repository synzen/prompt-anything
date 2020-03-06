import { Rejection } from './errors/Rejection'
import { TreeNode } from './TreeNode';
import { FormatGenerator, PhaseFunction, PhaseCondition, PhaseData, PhaseReturnData, PhaseCollectorCreator } from './types/phase';
import { MessageInterface } from './types/discord';

export class Phase extends TreeNode<Phase> {
  formatGenerator: FormatGenerator
  readonly duration: number
  readonly function?: PhaseFunction
  readonly condition?: PhaseCondition
  public static STRINGS = {
    exit: `Menu has been closed.`,
    inactivity: 'Menu has been closed due to inactivity.',
    rejected: `That is not a valid input. Try again.`
  }

  constructor(formatGenerator: FormatGenerator, f?: PhaseFunction, condition?: PhaseCondition, duration = 60000) {
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
  async sendMessage (message: MessageInterface, data: PhaseData): Promise<MessageInterface|null> {
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
  getNext (message: MessageInterface, data: PhaseData = {}): Phase|null {
    const { children } = this
    for (let i = 0; i < children.length; ++i) {
      const child = children[i]
      if (!child.condition || child.condition(message, data)) {
        return child
      }
    }
    return null
  }

  /**
   * Runs the Phase function for every message collected.
   * Reject when channel send promise rejects.
   * 
   * @param message - The MessageInterface before this phase
   * @param data - The data before this phase
   */
  collect (message: MessageInterface, createCollector: PhaseCollectorCreator, data: PhaseData = {}): Promise<PhaseReturnData> {
    const channel = message.channel
    return new Promise((resolve, reject) => {
      if (!this.function) {
        resolve({
          message,
          data
        })
        return
      }
      const collector = createCollector(message, this.function, data, this.duration)

      const terminate = (lastPhaseMessage: MessageInterface): void => {
        this.terminateHere()
        resolve({
          message: lastPhaseMessage,
          data
        })
      }

      collector.once('error', (lastUserInput: MessageInterface, err: Error) => {
        reject(err)
      })

      collector.once('exit', (userExitMessage: MessageInterface) => {
        channel.send(Phase.STRINGS.exit)
          .then((exitMessage) => terminate(exitMessage))
          .catch(reject)
      })

      collector.once('accept', (acceptMessage: MessageInterface, acceptData: PhaseData): void => {
        resolve({
          message: acceptMessage,
          data: acceptData
        })
      })

      collector.once('inactivity', (): void => {
        channel.send(Phase.STRINGS.inactivity)
          .then((exitMessage) => terminate(exitMessage))
          .catch(reject)
      })

      collector.on('reject', (userInput: MessageInterface, err: Rejection): void => {
        const invalidFeedback = err.message || Phase.STRINGS.rejected
        channel.send(invalidFeedback)
          .catch(reject)
      })
    })
  }
}

