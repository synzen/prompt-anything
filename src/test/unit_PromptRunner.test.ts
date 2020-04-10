import { Prompt, FormatGenerator, PromptFunction } from "../Prompt"
import { PromptRunner } from '../PromptRunner'
import { EventEmitter } from "events"
import { MessageInterface } from "../types/generics"
import { Rejection } from "../errors/Rejection"

jest.mock('../Prompt')

class MyPrompt extends Prompt<{}> {
  onReject(message: MessageInterface, error: Rejection): Promise<void> {
    throw new Error("Method not implemented.")
  }
  onInactivity(): Promise<void> {
    throw new Error("Method not implemented.")
  }
  onExit(message: MessageInterface): Promise<void> {
    throw new Error("Method not implemented.")
  }
  createCollector (): EventEmitter {
    return new EventEmitter()
  }

}

type MockMessage = {
  author: {
    id: string;
  };
  channel: {
    createMessageCollector: jest.Mock;
    send: jest.Mock;
  };
  content: string;
}

const createMockMessage = (content = ''): MockMessage => ({
  author: {
    id: '1'
  },
  channel: {
    createMessageCollector: jest.fn(),
    send: jest.fn(() => Promise.resolve())
  },
  content: content
})

type MockChannel = {
  send: jest.Mock;
}

const createMockChannel = (): MockChannel => ({
  send: jest.fn(() => Promise.resolve())
})

describe('Unit::PromptRunner', () => {
  const promptForm: FormatGenerator<{}> = () => ({
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
      const prompt = new MyPrompt(promptForm, promptFunc)
      const runner = new PromptRunner<{}>({})
      await expect(runner.run(prompt, channel))
        .rejects
        .toThrow('Invalid prompt found. Prompts with more than 1 child must have all its children to have a condition function specified.')
    })
    it('calls this.execute', async () => {
      jest.spyOn(PromptRunner, 'valid')
        .mockReturnValue(true)
      const channel = createMockChannel()
      const prompt = new MyPrompt(promptForm, promptFunc)
      const runner = new PromptRunner<{}>({})
      const spy = jest.spyOn(runner, 'execute')
        .mockResolvedValue()
      await runner.run(prompt, channel)
      expect(spy).toHaveBeenCalledWith(prompt, channel)
    })
  })
  describe('validate', () => {
    it('returns false if root prompt has no valid children', () => {
      const prompt = new MyPrompt(promptForm, promptFunc)
      jest.spyOn(prompt, 'hasValidChildren').mockReturnValue(false)
      expect(PromptRunner.valid(prompt)).toEqual(false)
    })
    it('returns false if one of the root node children is false', () => {
      const prompt1 = new MyPrompt(promptForm, promptFunc)
      const prompt2 = new MyPrompt(promptForm, promptFunc)
      const prompt3 = new MyPrompt(promptForm, promptFunc)
      prompt1.children = [prompt2, prompt3]
      prompt2.children = []
      prompt3.children = []
      jest.spyOn(prompt1, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(prompt2, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(prompt3, 'hasValidChildren').mockReturnValue(false)
      expect(PromptRunner.valid(prompt1)).toEqual(false)
    })
    it('returns false if one of the nested node children is false', () => {
      const prompt1 = new MyPrompt(promptForm, promptFunc)
      const prompt2 = new MyPrompt(promptForm, promptFunc)
      const prompt3 = new MyPrompt(promptForm, promptFunc)
      const prompt4 = new MyPrompt(promptForm, promptFunc)
      const prompt5 = new MyPrompt(promptForm, promptFunc)
      prompt1.children = [prompt2]
      prompt2.children = [prompt3]
      prompt3.children = [prompt4, prompt5]
      jest.spyOn(prompt1, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(prompt2, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(prompt3, 'hasValidChildren').mockReturnValue(true)
      jest.spyOn(prompt4, 'hasValidChildren').mockReturnValue(false)
      jest.spyOn(prompt5, 'hasValidChildren').mockReturnValue(true)
      expect(PromptRunner.valid(prompt1)).toEqual(false)
    })
  })
  describe('execute', () => {
    it('sends the message', async () => {
      const channel = createMockChannel()
      const prompt = new MyPrompt(promptForm, promptFunc)
      prompt.children = []
      jest.spyOn(prompt, 'collect')
        .mockResolvedValue({
          data: {},
          message: createMockMessage()
        })
      const promptSend = jest.spyOn(prompt, 'sendUserFormatMessage')
      const data = {
        foo: 1
      }
      const runner = new PromptRunner<{}>({})
      runner.initialData = data
      await runner.execute(prompt, channel)
      expect(promptSend).toHaveBeenCalledWith(channel, data)
    })
    it('sends all prompt messages', async () => {
      const channel = createMockChannel()
      const prompt1 = new MyPrompt(promptForm, promptFunc)
      const prompt2 = new MyPrompt(promptForm, promptFunc)
      const prompt3 = new MyPrompt(promptForm, promptFunc)
      jest.spyOn(prompt1, 'getNext')
        .mockResolvedValue(prompt2)
      jest.spyOn(prompt2, 'getNext')
        .mockResolvedValue(prompt3)
      jest.spyOn(prompt3, 'getNext')
        .mockResolvedValue(null)
      const prompts = [prompt1, prompt2, prompt3]
      const promptsCollectedData = [
        { a: 1 },
        { a: 2, b: 2 }
      ]
      const sendUserFormatMessageSpies = prompts.map((p, index) => {
        jest.spyOn(p, 'collect').mockResolvedValue(promptsCollectedData[index])
        return jest.spyOn(p, 'sendUserFormatMessage')
      })
      const initialData = {
        a: 0
      }
      const runner = new PromptRunner<{}>({})
      runner.initialData = initialData
      await runner.execute(prompt1, channel)
      expect(sendUserFormatMessageSpies[0]).toHaveBeenCalledWith(
        channel,
        initialData
      )
      expect(sendUserFormatMessageSpies[1]).toHaveBeenCalledWith(
        channel,
        promptsCollectedData[0]
      )
      expect(sendUserFormatMessageSpies[2]).toHaveBeenCalledWith(
        channel,
        promptsCollectedData[1]
      )
    })
    it('runs all prompts', async () => {
      const channel = createMockChannel()
      const prompt1 = new MyPrompt(promptForm, promptFunc)
      const prompt2 = new MyPrompt(promptForm, promptFunc)
      const prompt3 = new MyPrompt(promptForm, promptFunc)
      jest.spyOn(prompt1, 'getNext')
        .mockResolvedValue(prompt2)
      jest.spyOn(prompt2, 'getNext')
        .mockResolvedValue(prompt3)
      jest.spyOn(prompt3, 'getNext')
        .mockResolvedValue(null)
      const prompts = [prompt1, prompt2, prompt3]
      const collectSpies = prompts.map(p => {
        return jest.spyOn(p, 'collect').mockResolvedValue({
          data: {},
          message: createMockMessage()
        })
      })
      const runner = new PromptRunner<{}>({})
      await runner.execute(prompt1, channel)
      for (const spy of collectSpies) {
        expect(spy).toHaveBeenCalledTimes(1)
      }
    })
    it('adds each ran prompt into this.ran', async () => {
      const channel = createMockChannel()
      const prompt1 = new MyPrompt(promptForm, promptFunc)
      const prompt2 = new MyPrompt(promptForm, promptFunc)
      const prompt3 = new MyPrompt(promptForm, promptFunc)
      jest.spyOn(prompt1, 'getNext')
        .mockResolvedValue(prompt2)
      jest.spyOn(prompt2, 'getNext')
        .mockResolvedValue(prompt3)
      jest.spyOn(prompt3, 'getNext')
        .mockResolvedValue(null)
      const prompts = [prompt1, prompt2, prompt3]
      prompts.forEach(p => {
        return jest.spyOn(p, 'collect').mockResolvedValue({
          data: {},
          message: createMockMessage()
        })
      })
      const runner = new PromptRunner<{}>({})
      await runner.execute(prompt1, channel)
      expect(runner.ran).toEqual([prompt1, prompt2, prompt3])
    })
  })
  describe('indexesOf', () => {
    it('calls indexOf', () => {
      const prompt1 = new MyPrompt(promptForm, promptFunc)
      const prompt2 = new MyPrompt(promptForm, promptFunc)
      const prompt3 = new MyPrompt(promptForm, promptFunc)
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
      const prompt1 = new MyPrompt(promptForm, promptFunc)
      const prompt2 = new MyPrompt(promptForm, promptFunc)
      const prompt3 = new MyPrompt(promptForm, promptFunc)
      const runner = new PromptRunner<{}>({})
      Object.defineProperty(runner, 'ran', {
        value: [prompt2, prompt3, prompt1]
      })
      expect(runner.indexOf(prompt1))
        .toEqual(2)
    })
  })
})
