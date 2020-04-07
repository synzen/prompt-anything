import { Phase } from './Phase'
import { ChannelInterface } from './types/generics'

export class PhaseRunner<T> {
  initialData: T
  readonly ran: Array<Phase<T>> = []
  
  constructor (initialData: T) {
    this.initialData = initialData
  }

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
  async run (phase: Phase<T>, channel: ChannelInterface): Promise<void> {
    if (!PhaseRunner.valid(phase)) {
      throw new Error('Invalid phase found. Phases with more than 1 child must have all its children to have a condition function specified.')
    }
    return this.execute(phase, channel)
  }

  /**
   * Execute the phase without validating
   * 
   * @param phase Root phase
   * @param channel Channel
   * @param initialData Data for the root phase
   */
  async execute (initialPhase: Phase<T>, channel: ChannelInterface): Promise<void> {
    this.ran.push(initialPhase)
    let thisPhase: Phase<T>|null = initialPhase
    let thisData = this.initialData
    await thisPhase.sendUserFormatMessage(channel, thisData)
    while (thisPhase && thisPhase.shouldRunCollector()) {
      const phaseData: T = await thisPhase.collect(channel, thisData)
      thisPhase = await thisPhase.getNext(phaseData)
      thisData = phaseData
      if (thisPhase) {
        await thisPhase.sendUserFormatMessage(channel, phaseData)
        this.ran.push(thisPhase)
      }
    }
  }
}
