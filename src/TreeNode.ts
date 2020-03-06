export class TreeNode<T> {
  children: Array<T> = []

  /**
   * Sets the children of this node.
   * 
   * @param trees 
   */
  setChildren (trees: Array<T>): TreeNode<T> {
    this.children = trees
    return this
  }

  /**
   * Push a new node to this node's children.
   * 
   * @param tree
   */
  addChild (tree: T): TreeNode<T> {
    this.children.push(tree)
    return this
  }
}
