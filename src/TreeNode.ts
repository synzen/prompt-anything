export class TreeNode<T> {
  children: Array<T> = []

  /**
   * Sets the children of this node.
   * 
   * @param trees 
   */
  setChildren (trees: Array<T>): this {
    this.children = trees
    return this
  }

  /**
   * Push a new node to this node's children.
   * 
   * @param tree
   */
  addChild (tree: T): this {
    this.children.push(tree)
    return this
  }
}
