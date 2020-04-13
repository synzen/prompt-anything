import { Prompt } from './Prompt'
import { PromptNode } from './PromptNode'
import { ChannelInterface } from './interfaces/Channel'

export class PromptRunner<DataType> {
  initialData: DataType
  readonly ran: Array<Prompt<DataType>> = []
  
  constructor (initialData: DataType) {
    this.initialData = initialData
  }

  /**
   * Checks whether the tree of prompts is valid. A valid tree
   * is one all children has a condition if there 2 or more
   * children.
   * 
   * @param prompt Root prompt
   */
  static valid<DataType> (prompt: PromptNode<DataType>): boolean {
    if (!prompt.hasValidChildren()) {
      return false
    }
    const children = prompt.children
    for (const child of children) {
      if (!this.valid(child)) {
        return false
      }
    }
    return true
  }

  /**
   * Returns the index of a prompt that have been executed
   * by this PromptRunner already
   * 
   * @param prompt 
   */
  indexOf (prompt: Prompt<DataType>): number {
    return this.ran.indexOf(prompt)
  }

  /**
   * Returns the indexes of prompts that have been executed by
   * this PromptRunner already
   * 
   * @param prompts Prompts to check index of
   * @returns {Array<number>} Array of indices
   */
  indexesOf (prompts: Array<Prompt<DataType>>): Array<number> {
    return prompts.map(prompt => this.indexOf(prompt))
  }

  /**
   * Validate the prompt and all its children before executing
   * 
   * @param prompt Root prompt
   * @param channel Channel
   * @param initialData Data for the root prompt
   * @param triggerMessage Message that triggered this prompt
   */
  async run (rootNode: PromptNode<DataType>, channel: ChannelInterface): Promise<DataType> {
    if (!PromptRunner.valid(rootNode)) {
      throw new Error('Invalid rootNode found. Nodes with more than 1 child must have all its children have a condition function specified.')
    }
    return this.execute(rootNode, channel)
  }

  /**
   * Execute the prompt without validating
   * 
   * @param prompt Root prompt
   * @param channel Channel
   * @param initialData Data for the root prompt
   */
  async execute (rootNode: PromptNode<DataType>, channel: ChannelInterface): Promise<DataType> {
    let thisNode: PromptNode<DataType>|null = rootNode
    let thisData = this.initialData
    while (thisNode) {
      const thisPrompt: Prompt<DataType> = thisNode.prompt
      await thisNode.prompt.sendUserVisual(channel, thisData)
      const { data, terminate } = await thisPrompt.collect(channel, thisData)
      this.ran.push(thisNode.prompt)
      thisData = data
      if (terminate) {
        break
      }
      thisNode = await thisNode.getNext(data)
    }
    return thisData
  }
}
