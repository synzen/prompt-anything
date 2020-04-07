import { Phase } from './Phase'
import { ChannelInterface, MessageInterface } from './types/discord'

export class PhaseRunner<T> {
  readonly ran: Array<Phase<T>> = []
  
  /**
   * Checks whether the tree of phases is valid. A valid tree
   * is one all children has a condition if there 2 or more
   * children.
   * 
   * @param phase Root phase
   */
  static valid<T> (phase: Phase<T>): boolean {
    const children = phase.children
    const multipleChildren = children.length > 1
    for (const child of children) {
      if (multipleChildren && !child.condition) {
        return false
      }
      if (!this.valid(child)) {
        return false
      }
    }
    return true
  }

  /**
   * Returns the index of a phase that have been executed
   * by this PhaseRunner already
   * 
   * @param phase 
   */
  indexOf (phase: Phase<T>): number {
    return this.ran.indexOf(phase)
  }

  /**
   * Returns the indexes of phases that have been executed by
   * this PhaseRunner already
   * 
   * @param phases Phases to check index of
   * @returns {Array<number>} Array of indices
   */
  indexesOf (phases: Array<Phase<T>>): Array<number> {
    return phases.map(phase => this.indexOf(phase))
  }

  /**
   * Validate the phase and all its children before executing
   * 
   * @param phase Root phase
   * @param channel Channel
   * @param initialData Data for the root phase
   * @param triggerMessage Message that triggered this phase
   */
  async run (phase: Phase<T>, channel: ChannelInterface, initialData?: T, triggerMessage?: MessageInterface): Promise<void> {
    if (!PhaseRunner.valid(phase)) {
      throw new Error('Invalid phase found. Phases with more than 1 child must have all its children to have a condition function specified.')
    }
    return this.execute(phase, channel, initialData, triggerMessage)
  }

  /**
   * Execute the phase without validating
   * 
   * @param phase Root phase
   * @param channel Channel
   * @param initialData Data for the root phase
   */
  async execute (initialPhase: Phase<T>, channel: ChannelInterface, initialData?: T, triggerMessage?: MessageInterface): Promise<void> {
    this.ran.push(initialPhase)
    let thisPhase: Phase<T>|null = initialPhase
    let thisMessage = triggerMessage
    await thisPhase.sendUserFormatMessage(channel, initialData)
    while (thisPhase && thisPhase.shouldRunCollector()) {
      const {
        data: phaseData,
        message: phaseMessage
      }: {
        data?: T;
        message?: MessageInterface;
      } = await thisPhase.collect(channel, initialData, thisMessage)
      thisPhase = await thisPhase.getNext(phaseData)
      thisMessage = phaseMessage
      if (thisPhase) {
        await thisPhase.sendUserFormatMessage(channel, phaseData)
        this.ran.push(thisPhase)
      }
    }
  }

  static async run<T> (initialPhase: Phase<T>, channel: ChannelInterface, initialData?: T, triggerMessage?: MessageInterface): Promise<PhaseRunner<T>> {
    const runner = new PhaseRunner<T>()
    await runner.run(initialPhase, channel, initialData, triggerMessage)
    return runner
  }
}
