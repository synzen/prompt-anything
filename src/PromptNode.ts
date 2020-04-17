import { Prompt } from "./Prompt"
import { TreeNode } from "./TreeNode"
import { MessageInterface } from "./interfaces/Message"

export type PromptNodeCondition<DataType> = (data: DataType) => Promise<boolean>

export class PromptNode<DataType, MessageType extends MessageInterface> extends TreeNode<PromptNode<DataType, MessageType>> {
  prompt: Prompt<DataType, MessageType>
  readonly condition?: PromptNodeCondition<DataType>

  /**
   * @param prompt Prompt to run
   * @param condition Condition for this node to run
   */
  constructor (prompt: Prompt<DataType, MessageType>, condition?: PromptNodeCondition<DataType>) {
    super()
    this.prompt = prompt
    this.condition = condition
  }

  /**
   * Asserts that the children of this node are valid.
   * If a node has 2 or more children, then they must all
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
   * Determine what the next prompt node is given data.
   * 
   * @param data The data before this prompt
   */
  async getNext (data: DataType): Promise<PromptNode<DataType, MessageType>|null> {
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
   * Sets the children of this node.
   * 
   * @param nodes
   */
  setChildren (nodes: Array<PromptNode<DataType, MessageType>>): this {
    this.children = nodes
    return this
  }

  /**
   * Push a new node to this node's children.
   * 
   * @param node
   */
  addChild (node: PromptNode<DataType, MessageType>): this {
    this.children.push(node)
    return this
  }
}
