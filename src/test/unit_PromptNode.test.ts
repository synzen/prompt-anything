import { PromptNode } from "../PromptNode"
import { Prompt } from "../Prompt"
import { EventEmitter } from "events"
import { MessageInterface } from "../interfaces/Message"

jest.mock('../Prompt')

class MyPrompt extends Prompt<{}, MessageInterface> {
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
  describe('constructor', () => {
    it('initializes', () => {
      const prompt = new MyPrompt({ text: 'd' })
      const condition = async (): Promise<boolean> => true
      const promptNode = new PromptNode(prompt, condition)
      expect(promptNode.prompt).toEqual(prompt)
      expect(promptNode.condition).toEqual(condition)
    })
  })
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
      const child2 = new MyPrompt({text: ''})
      const child1Node = new PromptNode(child1)
      Object.defineProperty(child1Node, 'condition', {
        value: jest.fn()
      })
      const child2Node = new PromptNode(child2)
      Object.defineProperty(child2Node, 'condition', {
        value: jest.fn()
      })
      node.children = [
        child1Node,
        child2Node
      ]
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
      const promptC1Node = new PromptNode(promptC1)
      const promptC2Node = new PromptNode(promptC2)
      const promptC3Node = new PromptNode(promptC3)
      node.children = [
        promptC1Node,
        promptC2Node,
        promptC3Node
      ]
      Object.defineProperty(promptC1Node, 'condition', {
        value: async () => false
      })
      Object.defineProperty(promptC2Node, 'condition', {
        value: async () => true
      })
      Object.defineProperty(promptC3Node, 'condition', {
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
      const promptC1Node = new PromptNode(promptC1)
      const promptC2Node = new PromptNode(promptC2)
      node.children = [
        promptC1Node,
        promptC2Node
      ]
      Object.defineProperty(promptC1Node, 'condition', {
        value: async () => false
      })
      Object.defineProperty(promptC2Node, 'condition', {
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
      const promptC1Node = new PromptNode(promptC1)
      const promptC2Node = new PromptNode(promptC2)
      node.children = [
        promptC1Node,
        promptC2Node
      ]
      Object.defineProperty(promptC1Node, 'condition', {
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
