import { Prompt, VisualGenerator, PromptFunction } from "../Prompt"
import { PromptRunner } from '../PromptRunner'
import { EventEmitter } from "events"
import { PromptNode } from "../PromptNode"

jest.mock('../Prompt')
jest.mock('../PromptNode')

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

type MockChannel = {
  send: jest.Mock;
}

const createMockChannel = (): MockChannel => ({
  send: jest.fn(() => Promise.resolve())
})

describe('Unit::PromptRunner', () => {
  const promptVis: VisualGenerator<{}> = () => ({
    text: '1',
    embed: {
      title: '1'
    }
  })
  const promptFunc: PromptFunction<{}> = async () => ({})
  afterEach(() => {
    jest.restoreAllMocks()
  })
  describe('run', () => {
    it('throws error if invalid prompt', async () => {
      jest.spyOn(PromptRunner, 'valid')
        .mockReturnValue(false)
      const channel = createMockChannel()
      const prompt = new MyPrompt(promptVis, promptFunc)
      const node = new PromptNode(prompt)
      node.prompt = prompt
      const runner = new PromptRunner<{}>({})
      await expect(runner.run(node, channel))
        .rejects
        .toThrow('Invalid rootNode found. Nodes with more than 1 child must have all its children have a condition function specified.')
    })
    it('returns value of this.execute', async () => {
      jest.spyOn(PromptRunner, 'valid')
        .mockReturnValue(true)
      const channel = createMockChannel()
      const prompt = new MyPrompt(promptVis, promptFunc)
      const node = new PromptNode(prompt)
      const runner = new PromptRunner<{}>({})
      const executeReturnValue = {
        foo: 'bar'
      }
      jest.spyOn(runner, 'execute')
        .mockResolvedValue(executeReturnValue)
      const returned = await runner.run(node, channel)
      expect(returned).toEqual(executeReturnValue)
    })
  })
  describe('validate', () => {
    it('returns false if root prompt has no valid children', () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const node = new PromptNode(prompt)
      jest.spyOn(node, 'hasValidChildren').mockReturnValue(false)
      expect(PromptRunner.valid(node)).toEqual(false)
    })
    it('returns false if one of the root node children is false', () => {
      const prompt1 = new MyPrompt(promptVis, promptFunc)
      const prompt2 = new MyPrompt(promptVis, promptFunc)
      const prompt3 = new MyPrompt(promptVis, promptFunc)
      const node1 = new PromptNode(prompt1)
      const node2 = new PromptNode(prompt2)
      const node3 = new PromptNode(prompt3)
      node1.children = [node2, node3]
      node2.children = []
      node3.children = []
      jest.spyOn(node1, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(node2, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(node3, 'hasValidChildren').mockReturnValue(false)
      expect(PromptRunner.valid(node1)).toEqual(false)
    })
    it('returns false if one of the nested node children is false', () => {
      const prompt1 = new MyPrompt(promptVis, promptFunc)
      const prompt2 = new MyPrompt(promptVis, promptFunc)
      const prompt3 = new MyPrompt(promptVis, promptFunc)
      const prompt4 = new MyPrompt(promptVis, promptFunc)
      const prompt5 = new MyPrompt(promptVis, promptFunc)
      const node1 = new PromptNode(prompt1)
      const node2 = new PromptNode(prompt2)
      const node3 = new PromptNode(prompt3)
      const node4 = new PromptNode(prompt4)
      const node5 = new PromptNode(prompt5)
      node1.children = [node2]
      node2.children = [node3]
      node3.children = [node4, node5]
      jest.spyOn(node1, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(node2, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(node3, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(node4, 'hasValidChildren').mockReturnValue(false)
      jest.spyOn(node5, 'hasValidChildren').mockReturnValue(true)
      expect(PromptRunner.valid(node1)).toEqual(false)
    })
  })
  describe('execute', () => {
    it('sends all prompt messages', async () => {
      const channel = createMockChannel()
      const prompt1 = new MyPrompt(promptVis, promptFunc)
      const prompt2 = new MyPrompt(promptVis, promptFunc)
      const prompt3 = new MyPrompt(promptVis, promptFunc)
      const node1 = new PromptNode(prompt1)
      node1.prompt = prompt1
      const node2 = new PromptNode(prompt2)
      node2.prompt = prompt2
      const node3 = new PromptNode(prompt3)
      node3.prompt = prompt3
      jest.spyOn(node1, 'getNext')
        .mockResolvedValue(node2)
      jest.spyOn(node2, 'getNext')
        .mockResolvedValue(node3)
      jest.spyOn(node3, 'getNext')
        .mockResolvedValue(null)
      const prompts = [prompt1, prompt2, prompt3]
      const promptsCollectedData = [
        { a: 1 },
        { a: 2, b: 2 }
      ]
      const sendUserVisualSpies = prompts.map((p, index) => {
        jest.spyOn(p, 'collect').mockResolvedValue({
          data: promptsCollectedData[index],
          terminate: false
        })
        return jest.spyOn(p, 'sendUserVisual')
      })
      const initialData = {
        a: 0
      }
      const runner = new PromptRunner<{}>({})
      runner.initialData = initialData
      await runner.execute(node1, channel)
      expect(sendUserVisualSpies[0]).toHaveBeenCalledWith(
        channel,
        initialData
      )
      expect(sendUserVisualSpies[1]).toHaveBeenCalledWith(
        channel,
        promptsCollectedData[0]
      )
      expect(sendUserVisualSpies[2]).toHaveBeenCalledWith(
        channel,
        promptsCollectedData[1]
      )
    })
    it('runs all prompts', async () => {
      const channel = createMockChannel()
      const prompt1 = new MyPrompt(promptVis, promptFunc)
      const prompt2 = new MyPrompt(promptVis, promptFunc)
      const prompt3 = new MyPrompt(promptVis, promptFunc)
      const node1 = new PromptNode(prompt1)
      node1.prompt = prompt1
      const node2 = new PromptNode(prompt2)
      node2.prompt = prompt2
      const node3 = new PromptNode(prompt3)
      node3.prompt = prompt3
      jest.spyOn(node1, 'getNext')
        .mockResolvedValue(node2)
      jest.spyOn(node2, 'getNext')
        .mockResolvedValue(node3)
      jest.spyOn(node3, 'getNext')
        .mockResolvedValue(null)
      const prompts = [prompt1, prompt2, prompt3]
      const collectSpies = prompts.map(p => {
        return jest.spyOn(p, 'collect').mockResolvedValue({
          data: {},
          terminate: false
        })
      })
      const runner = new PromptRunner<{}>({})
      await runner.execute(node1, channel)
      for (const spy of collectSpies) {
        expect(spy).toHaveBeenCalledTimes(1)
      }
    })
    it('adds each ran prompt into this.ran', async () => {
      const channel = createMockChannel()
      const prompt1 = new MyPrompt(promptVis, promptFunc)
      const prompt2 = new MyPrompt(promptVis, promptFunc)
      const prompt3 = new MyPrompt(promptVis, promptFunc)
      const node1 = new PromptNode(prompt1)
      node1.prompt = prompt1
      const node2 = new PromptNode(prompt2)
      node2.prompt = prompt2
      const node3 = new PromptNode(prompt3)
      node3.prompt = prompt3
      jest.spyOn(node1, 'getNext')
        .mockResolvedValue(node2)
      jest.spyOn(node2, 'getNext')
        .mockResolvedValue(node3)
      jest.spyOn(node3, 'getNext')
        .mockResolvedValue(null)
      const prompts = [prompt1, prompt2, prompt3]
      prompts.forEach(p => {
        return jest.spyOn(p, 'collect').mockResolvedValue({
          data: {},
          terminate: false
        })
      })
      const runner = new PromptRunner<{}>({})
      await runner.execute(node1, channel)
      expect(runner.ran[0]).toEqual(prompt1)
      expect(runner.ran[1]).toEqual(prompt2)
      expect(runner.ran[2]).toEqual(prompt3)
    })
    it('returns the data of the last prompt', async () => {
      const channel = createMockChannel()
      const prompt1 = new MyPrompt(promptVis, promptFunc)
      const prompt2 = new MyPrompt(promptVis, promptFunc)
      const prompt3 = new MyPrompt(promptVis, promptFunc)
      const node1 = new PromptNode(prompt1)
      node1.prompt = prompt1
      const node2 = new PromptNode(prompt2)
      node2.prompt = prompt2
      const node3 = new PromptNode(prompt3)
      node3.prompt = prompt3
      const prompt1Returned = {
        data: { val: 1, a: 1 },
        terminate: false
      }
      jest.spyOn(node1, 'getNext')
        .mockResolvedValue(node2)
      jest.spyOn(prompt1, 'collect')
        .mockResolvedValue(prompt1Returned)
      const prompt2Returned = {
        data: { val: 2, b: 2 },
        terminate: false
      }
      jest.spyOn(node2, 'getNext')
        .mockResolvedValue(node3)
      jest.spyOn(prompt2, 'collect')
        .mockResolvedValue(prompt2Returned)
      const prompt3Returned = {
        data: { val: 3, c: 3 },
        terminate: false
      }
      jest.spyOn(node3, 'getNext')
        .mockResolvedValue(null)
      jest.spyOn(prompt3, 'collect')
        .mockResolvedValue(prompt3Returned)
      const runner = new PromptRunner<{}>({})
      const returned = await runner.execute(node1, channel)
      expect(returned).toEqual(prompt3Returned.data)
    })
    it('does not run any more when a prompt terminates', async () => {
      const channel = createMockChannel()
      const prompt1 = new MyPrompt(promptVis, promptFunc)
      const prompt2 = new MyPrompt(promptVis, promptFunc)
      const prompt3 = new MyPrompt(promptVis, promptFunc)
      const node1 = new PromptNode(prompt1)
      node1.prompt = prompt1
      const node2 = new PromptNode(prompt2)
      node2.prompt = prompt2
      const node3 = new PromptNode(prompt3)
      node3.prompt = prompt3
      jest.spyOn(node1, 'getNext')
        .mockResolvedValue(node2)
      jest.spyOn(node2, 'getNext')
        .mockResolvedValue(node3)
      jest.spyOn(node3, 'getNext')
        .mockResolvedValue(null)
      jest.spyOn(prompt1, 'collect').mockResolvedValue({
        data: {},
        terminate: false
      })
      jest.spyOn(prompt2, 'collect').mockResolvedValue({
        data: {},
        terminate: true
      })
      const prompt3Collect = jest.spyOn(prompt3, 'collect').mockResolvedValue({
        data: {},
        terminate: true
      })
      const runner = new PromptRunner<{}>({})
      await runner.execute(node1, channel)
      expect(prompt3Collect).not.toHaveBeenCalled()
    })
  })
  describe('indexesOf', () => {
    it('calls indexOf', () => {
      const prompt1 = new MyPrompt(promptVis, promptFunc)
      const prompt2 = new MyPrompt(promptVis, promptFunc)
      const prompt3 = new MyPrompt(promptVis, promptFunc)
      const runner = new PromptRunner<{}>({})
      Object.defineProperty(runner, 'ran', {
        value: [prompt2, prompt3, prompt1]
      })
      const spy = jest.spyOn(runner, 'indexOf')
        .mockReturnValue(1)
      runner.indexesOf([prompt1, prompt2, prompt3])
      expect(spy).toHaveBeenCalledTimes(3)
      expect(spy).toHaveBeenCalledWith(prompt1)
      expect(spy).toHaveBeenCalledWith(prompt2)
      expect(spy).toHaveBeenCalledWith(prompt3)
    })
  })
  describe('indexOf', () => {
    it('returns the index of the prompt', () => {
      const prompt1 = new MyPrompt(promptVis, promptFunc)
      const prompt2 = new MyPrompt(promptVis, promptFunc)
      const prompt3 = new MyPrompt(promptVis, promptFunc)
      const runner = new PromptRunner<{}>({})
      Object.defineProperty(runner, 'ran', {
        value: [prompt2, prompt3, prompt1]
      })
      expect(runner.indexOf(prompt1))
        .toEqual(2)
    })
  })
})
