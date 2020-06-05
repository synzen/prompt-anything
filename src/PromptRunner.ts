import { Prompt } from './Prompt'
import { PromptNode } from './PromptNode'
import { ChannelInterface } from './interfaces/Channel'
import { MessageInterface } from './interfaces/Message'

export class PromptRunner<DataType, MessageType extends MessageInterface> {
  initialData: DataType
  readonly ran: Array<Prompt<DataType, MessageType>> = []
  
  constructor (initialData: DataType) {
    this.initialData = initialData
  }

  /**
   * Checks whether the tree of nodes is valid. A valid tree
   * is one all children has a condition if there 2 or more
   * children.
   * 
   * @param prompt Root prompt
   */
  static valid<DataType, MessageType extends MessageInterface> (prompt: PromptNode<DataType, MessageType>, seen: Set<PromptNode<DataType, MessageType>> = new Set()): boolean {
    if (seen.has(prompt)) {
      return true
    }
    if (!prompt.hasValidChildren()) {
      return false
    }
    seen.add(prompt)
    const children = prompt.children
    for (const child of children) {
      if (!this.valid(child, seen)) {
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
  indexOf (prompt: Prompt<DataType, MessageType>): number {
    return this.ran.indexOf(prompt)
  }

  /**
   * Returns the indexes of prompts that have been executed by
   * this PromptRunner already
   * 
   * @param prompts Prompts to check index of
   * @returns {Array<number>} Array of indices
   */
  indexesOf (prompts: Array<Prompt<DataType, MessageType>>): Array<number> {
    return prompts.map(prompt => this.indexOf(prompt))
  }

  /**
   * Get the first node whose condition passes, given this
   * runner's initial data
   * 
   * @param nodes Array of prompt nodes
   */
  async getFirstNode (nodes: Array<PromptNode<DataType, MessageType>>): Promise<PromptNode<DataType, MessageType>|null> {
    for (let i = 0; i < nodes.length; ++i) {
      const node = nodes[i]
      const condition = node.condition
      if (!condition || await condition(this.initialData)) {
        return node
      }
    }
    return null
  }

  /**
   * Validate the node prompt and all its children before
   * executing
   * 
   * @param rootNode Root prompt node
   * @param channel Channel to run the prompt in
   */
  async run (rootNode: PromptNode<DataType, MessageType>, channel: ChannelInterface<MessageType>): Promise<DataType> {
    if (!PromptRunner.valid(rootNode)) {
      throw new Error('Invalid rootNode found. Nodes with more than 1 child must have all its children have a condition function specified.')
    }
    return this.execute(rootNode, channel)
  }

  
  /**
   * Get the first node whose condition passes, and run
   * it
   * 
   * @param rootNode Root prompt node
   * @param channel Channel to run the root prompt node
   */
  async runArray (rootNode: Array<PromptNode<DataType, MessageType>>, channel: ChannelInterface<MessageType>): Promise<DataType> {
    const matched = await this.getFirstNode(rootNode)
      if (matched) {
        return this.run(matched, channel)
      } else {
        return this.initialData
      }
  }

  /**
   * Run the PromptNode without validating
   * 
   * @param PromptNode Root prompt node
   * @param channel Channel
   */
  async execute (rootNode: PromptNode<DataType, MessageType>, channel: ChannelInterface<MessageType>): Promise<DataType> {
    let thisNode: PromptNode<DataType, MessageType>|null = rootNode
    let thisData = this.initialData
    while (thisNode) {
      const thisPrompt: Prompt<DataType, MessageType> = thisNode.prompt
      const data = await thisPrompt.run(channel, thisData)
      this.ran.push(thisNode.prompt)
      thisData = data
      thisNode = await thisNode.getNext(data)
    }
    return thisData
  }
}
