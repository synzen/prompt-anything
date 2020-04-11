import { TreeNode } from "../TreeNode"

describe('Unit::TreeNode', () => {
  describe('setChildren', () => {
    it('works', () => {
      const node = new TreeNode()
      const node1 = new TreeNode()
      const node2 = new TreeNode()
      node.setChildren([node1, node2])
      expect(node.children).toEqual([node1, node2])
    })
  })
  describe('addChild', () => {
    it('works', () => {
      const node1 = new TreeNode()
      const node2 = new TreeNode()
      const node3 = new TreeNode()
      node1.children = [node1, node2, node3]
      node1.addChild(node3)
      expect(node1.children).toEqual([node1, node2, node3, node3])
    })
  })
})
