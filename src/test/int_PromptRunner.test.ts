import { Prompt, FormatGenerator, PromptFunction, PromptCondition } from "../Prompt"
import { PromptRunner } from '../PromptRunner'
import { EventEmitter } from "events"
import { Rejection } from "../errors/Rejection";
import { MessageInterface } from "../types/generics";

async function flushPromises(): Promise<void> {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

type MockChannel = {
  send: jest.Mock;
}

type MockMessage = {
  content: string;
}

const createMockChannel = (): MockChannel => ({
  send: jest.fn(() => Promise.resolve())
})

const createMockMessage = (content = ''): MockMessage => ({
  content
})

const promptForm: FormatGenerator<{}> = () => ({
  text: '1',
  embed: {
    title: '1'
  }
})
const promptFunc: PromptFunction<{}> = async () => ({})

class MyPrompt<T> extends Prompt<T> {
  onReject(message: MessageInterface, error: Rejection): Promise<void> {
    throw new Error("Method not implemented.");
  }
  onInactivity(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  onExit(message: MessageInterface): Promise<void> {
    throw new Error("Method not implemented.");
  }
  createCollector (): EventEmitter {
    return new EventEmitter()
  }
}

describe('Int::PromptRunner', () => {
  let emitter = new EventEmitter()
  beforeEach(() => {
    emitter = new EventEmitter()
    jest.spyOn(MyPrompt.prototype, 'createCollector')
      .mockReturnValue(emitter)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })
  describe('validate', () => {
    it('returns true for <= 1 children with no conditions', () => {
      const promptR = new MyPrompt(promptForm, promptFunc)
      const promptR1 = new MyPrompt(promptForm, promptFunc)
      const promptR11 = new MyPrompt(promptForm, promptFunc)
      promptR.children = [promptR1]
      promptR1.children = [promptR11]
      promptR11.children = []
      expect(PromptRunner.valid(promptR)).toEqual(true)
    })
    it('returns false for > 1 children with some having no conditions', () => {
      const promptR = new MyPrompt(promptForm, promptFunc)
      const promptR1 = new MyPrompt(promptForm, promptFunc)
      const promptR11 = new MyPrompt(promptForm, promptFunc)
      const promptR12 = new MyPrompt(promptForm, promptFunc)
      promptR.children = [promptR1]
      promptR1.children = [promptR11, promptR12]
      promptR11.children = []
      promptR12.children = []
      expect(PromptRunner.valid(promptR)).toEqual(false)
    })
    it('returns true for > 1 children all having conditions', () => {
      const promptR = new MyPrompt(promptForm, promptFunc)
      const promptR1 = new MyPrompt(promptForm, promptFunc)
      const promptR11 = new MyPrompt(promptForm, promptFunc)
      Object.defineProperty(promptR11, 'condition', {
        value: () => false
      })
      const promptR12 = new MyPrompt(promptForm, promptFunc)
      Object.defineProperty(promptR12, 'condition', {
        value: () => true
      })
      const promptR121 = new MyPrompt(promptForm, promptFunc)
      Object.defineProperty(promptR121, 'condition', {
        value: () => true
      })
      const promptR122 = new MyPrompt(promptForm, promptFunc)
      Object.defineProperty(promptR122, 'condition', {
        value: () => true
      })
      promptR.children = [promptR1]
      promptR1.children = [promptR11, promptR12]
      promptR11.children = []
      promptR12.children = [promptR121, promptR122]
      promptR121.children = []
      promptR122.children = []
      expect(PromptRunner.valid(promptR)).toEqual(true)
    })
  })
  describe('execute', () => {
    it('runs the right prompts (ignoring collect)', async () => {
      const channel = createMockChannel()
      const promptR = new MyPrompt(promptForm, promptFunc)
      const promptRC1 = new MyPrompt(promptForm, promptFunc, async () => false)
      const promptRC2 = new MyPrompt(promptForm, promptFunc, async () => true)
      const promptRC11 = new MyPrompt(promptForm, promptFunc)
      const promptRC111 = new MyPrompt(promptForm, undefined, async () => true)
      const promptRC112 = new MyPrompt(promptForm, undefined, async () => false)
      const prompts = [promptR, promptRC1, promptRC2, promptRC11, promptRC111, promptRC112]
      const spies = prompts.map(p => {
        p.children = []
        return jest.spyOn(p, 'collect').mockResolvedValue({
          data: {},
          message: createMockMessage()
        })
      })

      promptR.children = [promptRC1, promptRC2]
      promptRC2.children = [promptRC11]
      // Either of these should not collect since they have no children
      promptRC11.children = [promptRC111, promptRC112]
      const runner = new PromptRunner<{}>({})
      await runner.execute(promptR, channel)
      expect(spies[0]).toHaveBeenCalledTimes(1)
      expect(spies[1]).not.toHaveBeenCalled()
      expect(spies[2]).toHaveBeenCalledTimes(1)
      expect(spies[3]).toHaveBeenCalledTimes(1)
      expect(spies[4]).toHaveBeenCalledTimes(1)
      expect(spies[5]).not.toHaveBeenCalled()
      expect(runner.indexesOf(prompts)).toEqual([
        0, -1, 1, 2, 3, -1
      ])
    })
    it('runs collect for regular Prompt even if no children', async () => {
      const channel = createMockChannel()
      const prompt = new MyPrompt(promptForm, promptFunc)
      const spy = jest.spyOn(prompt, 'collect').mockResolvedValue({
        data: {},
        message: createMockMessage()
      })
      const runner = new PromptRunner<{}>({})
      await runner.execute(prompt, channel)
      expect(spy).toHaveBeenCalledTimes(1)
    })
    it('does not run collect for prompt with no function', async () => {
      const channel = createMockChannel()
      const prompt = new MyPrompt(promptForm)
      const spy = jest.spyOn(prompt, 'createCollector')
      const runner = new PromptRunner<{}>({})
      await runner.execute(prompt, channel)
      expect(spy).not.toHaveBeenCalled()
    })
  })
  describe('run', () => {
    it('works with prompt collect and getNext', async () => {
      const channel = createMockChannel()
      const prompt = new MyPrompt(promptForm, promptFunc)
      const promptC1 = new MyPrompt(promptForm, promptFunc, async () => false)
      const promptC2 = new MyPrompt(promptForm, promptFunc, async () => true)
      const promptC21 = new MyPrompt(promptForm)

      prompt.children = [promptC1, promptC2]
      promptC2.children = [promptC21]
      promptC21.children = []

      const runner = new PromptRunner<{}>({})
      const promise = runner.run(prompt, channel)
      await flushPromises()
      emitter.emit('message', createMockMessage())
      expect(runner.indexOf(prompt)).toEqual(0)
      await flushPromises()
      emitter.emit('message', createMockMessage())
      expect(runner.indexOf(promptC1)).toEqual(-1)
      expect(runner.indexOf(promptC2)).toEqual(1)
      await promise
      expect(runner.indexOf(promptC21)).toEqual(2)
    })
    it('works with custom functions', async () => {
      type PromptData = {
        age?: number;
        name?: string;
      }
      const thisPromptForm: FormatGenerator<PromptData> = () => ({
        text: '1',
        embed: {
          title: '1'
        }
      })
      const askNameFn: PromptFunction<PromptData> = async (m, data) => {
        if (!data) {
          throw new Error('Missing data')
        }
        data.name = m.content
        return data
      }
      
      // Ask age prompt that collects messages
      const askAgeFn: PromptFunction<PromptData> = async (m, data) => {
        if (!data) {
          throw new Error('Missing data')
        }
        if (isNaN(Number(m.content))) {
          // Send a rejection message and continue collecting
          throw new Rejection()
        }
        data.age = Number(m.content)
        return data
      }
      const tooOldFn: PromptCondition<PromptData> = async (data) => {
        return !!(data.age && data.age >= 20)
      }
      const tooYoungFn: PromptCondition<PromptData> = async (data) => {
        return !!(data.age && data.age < 20)
      }

      const askName = new MyPrompt<PromptData>(thisPromptForm, askNameFn)
      const askAge = new MyPrompt<PromptData>(thisPromptForm, askAgeFn)
      const tooOld = new MyPrompt<PromptData>(thisPromptForm, undefined, tooOldFn)
      const tooYoung = new MyPrompt<PromptData>(thisPromptForm, undefined, tooYoungFn)
      askName.setChildren([askAge])
      askAge.setChildren([tooOld, tooYoung])
      
      const channel = createMockChannel()
      const name = 'George'
      const age = '30'
      
      const runner = new PromptRunner<PromptData>({})
      const promise = runner.run(askName, channel)
      // Wait for all pending promise callbacks to be executed for the emitter to set up
      await flushPromises()
      // Accept the name
      emitter.emit('message', createMockMessage(name))
      expect(runner.indexOf(askName)).toEqual(0)
      // Wait for all pending promise callbacks to be executed for message to be accepted
      await flushPromises()
      // Accept the age
      emitter.emit('message', createMockMessage(age))
      expect(runner.indexOf(askAge)).toEqual(1)
      await promise
      expect(runner.indexesOf([tooOld, tooYoung]))
        .toEqual([2, -1])
    })
    it('calls all functions', async () => {
      type PromptData = {
        age?: number;
        name?: string;
      }
      const thisPromptForm: FormatGenerator<PromptData> = () => ({
        text: '1',
        embed: {
          title: '1'
        }
      })
      const askNameFnSpy = jest.fn()
      const askNameFn: PromptFunction<PromptData> = async (m, data) => {
        askNameFnSpy()
        if (!data) {
          throw new Error('Missing data')
        }
        data.name = m.content
        return data
      }
      const askName = new MyPrompt<PromptData>(thisPromptForm, askNameFn)
      
      // Ask age prompt that collects messages
      const askAgeFnSpy = jest.fn()
      const askAgeFn: PromptFunction<PromptData> = async (m, data) => {
        askAgeFnSpy()
        if (!data) {
          throw new Error('Missing data')
        }
        if (isNaN(Number(m.content))) {
          // Send a rejection message and continue collecting
          throw new Rejection()
        }
        data.age = Number(m.content)
        return data
      }
      const tooOldFnSpy = jest.fn()
      const tooOldFn: PromptCondition<PromptData> = async (data) => {
        tooOldFnSpy()
        return !!(data.age && data.age >= 20)
      }
      const tooYoungFnSpy = jest.fn()
      const tooYoungFn: PromptCondition<PromptData> = async (data) => {
        tooYoungFnSpy()
        return !!(data.age && data.age < 20)
      }
      const askAge = new MyPrompt<PromptData>(thisPromptForm, askAgeFn)
      const tooOld = new MyPrompt<PromptData>(thisPromptForm, undefined, tooOldFn)
      const tooYoung = new MyPrompt<PromptData>(thisPromptForm, undefined, tooYoungFn)
      askName.setChildren([askAge])
      askAge.setChildren([tooOld, tooYoung])
      
      const channel = createMockChannel()
      const name = 'George'
      const age = '30'
      const runner = new PromptRunner<PromptData>({})
      const promise = runner.run(askName, channel)
      // Wait for all pending promise callbacks to be executed for the emitter to set up
      await flushPromises()
      // Accept the name
      emitter.emit('message', createMockMessage(name))
      expect(askNameFnSpy).toHaveBeenCalledTimes(1)
      // Wait for all pending promise callbacks to be executed for message to be accepted
      await flushPromises()
      // Accept the age
      emitter.emit('message', createMockMessage(age))
      expect(askAgeFnSpy).toHaveBeenCalledTimes(1)
      await promise
      expect(tooOldFnSpy).toHaveBeenCalledTimes(1)
      expect(tooYoungFnSpy).not.toHaveBeenCalled()
    })
    it('works with functions added mid-run', async () => {
      type PromptData = {
        age?: number;
        name?: string;
      }
      const thisPromptForm: FormatGenerator<PromptData> = () => ({
        text: '1',
        embed: {
          title: '1'
        }
      })
      const tooOldFn: PromptCondition<PromptData> = async (data) => {
        return !!(data.age && data.age >= 20)
      }
      const tooYoungFn: PromptCondition<PromptData> = async (data) => {
        return !!(data.age && data.age < 20)
      }
      const tooOld = new MyPrompt<PromptData>(thisPromptForm, undefined, tooOldFn)
      const tooYoung = new MyPrompt<PromptData>(thisPromptForm, undefined, tooYoungFn)
      // Ask age prompt that collects messages
      const askAgeFn: PromptFunction<PromptData> = async function (m, data) {
        if (!data) {
          throw new Error('Missing data')
        }
        if (isNaN(Number(m.content))) {
          // Send a rejection message and continue collecting
          throw new Rejection()
        }
        data.age = Number(m.content)
        this.setChildren([tooYoung, tooOld])
        return data
      }
      const askAge = new MyPrompt<PromptData>(thisPromptForm, askAgeFn)
      
      const askNameFn: PromptFunction<PromptData> = async function (m, data) {
        if (!data) {
          throw new Error('Missing data')
        }
        data.name = m.content
        this.setChildren([askAge])
        return data
      }
      const askName = new MyPrompt<PromptData>(thisPromptForm, askNameFn)

      const channel = createMockChannel()
      const name = 'George'
      const age = '30'
      const runner = new PromptRunner<PromptData>({})
      const promise = runner.run(askName, channel)
      // Wait for all pending promise callbacks to be executed for the emitter to set up
      await flushPromises()
      // Accept the name
      emitter.emit('message', createMockMessage(name))
      expect(runner.indexOf(askName)).toEqual(0)
      // Wait for all pending promise callbacks to be executed for message to be accepted
      await flushPromises()
      // Accept the age
      emitter.emit('message', createMockMessage(age))
      expect(runner.indexOf(askAge)).toEqual(1)
      await promise
      expect(runner.indexesOf([tooOld, tooYoung]))
        .toEqual([2, -1])
    })
  })
})
