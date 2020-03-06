import { Phase } from './Phase'
import { PhaseData, PhaseCollectorCreator } from './types/phase'
import { MessageInterface } from './types/discord'

export class PhaseRunner {
  /**
   * Checks whether the tree of phases is valid. A valid tree
   * is one all children has a condition if there 2 or more
   * children.
   * 
   * @param phase - Root phase
   */
  static valid (phase: Phase): boolean {
    const children = phase.children
    for (let i = 0; i < children.length; ++i) {
      const child = children[i]
      if (!child.condition && children.length > 1) {
        return false
      }
      if (!this.valid(child)) {
        return false
      }
    }
    return true
  }

  /**
   * Validate the phase and all its children before executing
   * 
   * @param phase - Root phase
   * @param message - The author's message
   * @param collectorCreator - Function to create a message collector
   * @param initialData - Data for the root phase
   */
  static async run (phase: Phase, message: MessageInterface, collectorCreator: PhaseCollectorCreator, initialData: PhaseData = {}): Promise<void> {
    if (!this.valid(phase)) {
      throw new Error('Invalid phase setup')
    }
    return this.execute(phase, message, collectorCreator, initialData)
  }

  /**
   * Execute the phase without validating
   * 
   * @param phase - Root phase
   * @param message - The author's message
   * @param collectorCreator - Function to create a message collector
   * @param initialData - Data for the root phase
   */
  static async execute (phase: Phase, message: MessageInterface, collectorCreator: PhaseCollectorCreator, initialData: PhaseData = {}): Promise<void> {
    await phase.sendMessage(message, initialData)
    if (phase.children.length === 0) {
      // A phase with no children has no need to collect inputs
      return
    }
    const { data: phaseData, message: phaseMessage } = await phase.collect(message, collectorCreator, initialData)
    const next = phase.getNext(phaseMessage, phaseData)
    if (next) {
      return this.execute(next, phaseMessage, collectorCreator, phaseData)
    }
  }
}
