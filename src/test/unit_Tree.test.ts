import { TreeNode } from "../TreeNode"

describe('Unit::TreeNode', () => {
  describe('setChildren', () => {
    it('works', () => {
      const node = new TreeNode()
      node.setChildren([1, 2, 3])
      expect(node.children).toEqual([1, 2, 3])
    })
  })
  describe('addChild', () => {
    it('works', () => {
      const node = new TreeNode()
      node.children = [1, 2, 3]
      node.addChild(4)
      expect(node.children).toEqual([1, 2, 3, 4])
    })
  })
})
