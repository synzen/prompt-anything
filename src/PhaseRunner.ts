import { Phase } from './Phase'
import { PhaseData, PhaseCollectorCreator } from './types/phase'
import { MessageInterface } from './types/discord'

export class PhaseRunner {
  readonly ran: Array<Phase> = []
  /**
   * Checks whether the tree of phases is valid. A valid tree
   * is one all children has a condition if there 2 or more
   * children.
   * 
   * @param phase - Root phase
   */
  static valid (phase: Phase): boolean {
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
   * Validate the phase and all its children before executing
   * 
   * @param phase - Root phase
   * @param message - The author's message
   * @param collectorCreator - Function to create a message collector
   * @param initialData - Data for the root phase
   */
  async run (phase: Phase, message: MessageInterface, collectorCreator: PhaseCollectorCreator, initialData: PhaseData = {}): Promise<void> {
    if (!PhaseRunner.valid(phase)) {
      throw new Error('Invalid phase found. Phases with more than 1 child must have all its children to have a condition function specified.')
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
  async execute (initialPhase: Phase, message: MessageInterface, collectorCreator: PhaseCollectorCreator, initialData: PhaseData = {}): Promise<void> {
    this.ran.push(initialPhase)
    await initialPhase.sendMessage(message, initialData)
    let thisPhase: Phase|null = initialPhase
    while (thisPhase && thisPhase.children.length > 0) {
      const { data: phaseData, message: phaseMessage } = await thisPhase.collect(message, collectorCreator, initialData)
      
      thisPhase = thisPhase.getNext(phaseMessage, phaseData)
      if (thisPhase) {
        this.ran.push(thisPhase)
      }
    }
  }

  static async run (initialPhase: Phase, message: MessageInterface, collectorCreator: PhaseCollectorCreator, initialData: PhaseData = {}): Promise<PhaseRunner> {
    const runner = new PhaseRunner()
    await runner.run(initialPhase, message, collectorCreator, initialData)
    return runner
  }
}
