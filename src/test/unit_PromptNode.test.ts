import { PromptNode } from "../PromptNode"
import { Prompt } from "../Prompt"
import { EventEmitter } from "events"

jest.mock('../Prompt')

class MyPrompt extends Prompt<{}> {
  onReject(): Promise<void> {
    throw new Error("Method not implemented.")
  }
  onInactivity(): Promise<void> {
    throw new Error("Method not implemented.")
  }
  onExit(): Promise<void> {
    throw new Error("Method not implemented.")
  }
  createCollector (): EventEmitter {
    return new EventEmitter()
  }
}

const promptVis = {text: '1'}
describe('Unit::PromptNode', () => {
  describe('hasValidChildren', () => {
    it('returns true for prompt with 0 or 1 child', () => {
      const prompt = new MyPrompt({text: ''})
      const node1 = new PromptNode(prompt)
      node1.children = []
      expect(node1.hasValidChildren()).toEqual(true)
      const node2 = new PromptNode(prompt)
      node1.children = [node2]
      expect(node1.hasValidChildren()).toEqual(true)
    })
    it('returns false for 2+ children with no condition', () => {
      const prompt = new MyPrompt({text:''})
      const node = new PromptNode(prompt)
      const child1 = new MyPrompt({text: ''})
      Object.defineProperty(child1, 'condition', {
        value: undefined
      })
      const child2 = new MyPrompt({text: ''})
      Object.defineProperty(child2, 'condition', {
        value: undefined
      })
      node.children = [new PromptNode(child1), new PromptNode(child2)]
      expect(node.hasValidChildren()).toEqual(false)
    })
    it('returns true for 2+ children with conditions', () => {
      const prompt = new MyPrompt({text: ''})
      const node = new PromptNode(prompt)
      const child1 = new MyPrompt({text: ''})
      Object.defineProperty(child1, 'condition', {
        value: jest.fn()
      })
      const child2 = new MyPrompt({text: ''})
      Object.defineProperty(child2, 'condition', {
        value: jest.fn()
      })
      node.children = [new PromptNode(child1), new PromptNode(child2)]
      expect(node.hasValidChildren()).toEqual(true)
    })
  })
  describe('getNext', () => {
    it('returns the right child', async () => {
      const prompt = new MyPrompt(promptVis)
      const node = new PromptNode(prompt)
      const promptC1 = new MyPrompt(promptVis)
      const promptC2 = new MyPrompt(promptVis)
      const promptC3 = new MyPrompt(promptVis)
      node.children = [
        new PromptNode(promptC1),
        new PromptNode(promptC2),
        new PromptNode(promptC3)
      ]
      Object.defineProperty(promptC1, 'condition', {
        value: async () => false
      })
      Object.defineProperty(promptC2, 'condition', {
        value: async () => true
      })
      Object.defineProperty(promptC3, 'condition', {
        value: async () => true
      })
      await expect(node.getNext({}))
        .resolves.toEqual(node.children[1])
    })
    it('returns null for no elgiible children', async () => {
      const prompt = new MyPrompt(promptVis)
      const node = new PromptNode(prompt)
      const promptC1 = new MyPrompt(promptVis)
      const promptC2 = new MyPrompt(promptVis)
      node.children = [
        new PromptNode(promptC1),
        new PromptNode(promptC2)
      ]
      Object.defineProperty(promptC1, 'condition', {
        value: async () => false
      })
      Object.defineProperty(promptC2, 'condition', {
        value: async () => false
      })
      await expect(node.getNext({}))
        .resolves.toEqual(null)
    })
    it('returns one with no condition if it exists', async () => {
      const prompt = new MyPrompt(promptVis)
      const node = new PromptNode(prompt)
      const promptC1 = new MyPrompt(promptVis)
      const promptC2 = new MyPrompt(promptVis)
      node.children = [
        new PromptNode(promptC1),
        new PromptNode(promptC2)
      ]
      Object.defineProperty(promptC1, 'condition', {
        value: async () => false
      })
      await expect(node.getNext({}))
        .resolves.toEqual(node.children[1])
    })
  })
  describe('addChild', () => {
    it('pushes the node to children', () => {
      const prompt = new MyPrompt(promptVis)
      const prompt2 = new MyPrompt(promptVis)
      const node = new PromptNode(prompt)
      const node2 = new PromptNode(prompt2)
      node.addChild(node2)
      expect(node.children).toEqual([node2])
      node.addChild(node2)
      expect(node.children).toEqual([node2, node2])
    })
    it('returns this', () => {
      const prompt = new MyPrompt(promptVis)
      const node = new PromptNode(prompt)
      const node2 = new PromptNode(prompt)
      const returned = node.addChild(node2)
      expect(returned).toEqual(node)
    })
  })
})
