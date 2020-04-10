import { Prompt } from "../Prompt"
import { EventEmitter } from 'events'
import { Rejection } from '../errors/Rejection'
import { MessageInterface, FormatInterface } from "../types/generics";

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

async function flushPromises(): Promise<void> {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

type MockChannel = {
  createMessageCollector: jest.Mock;
  send: jest.Mock;
}

type MockMessage = {
  author: {
    id: string;
  };
  channel: MockChannel;
  content: string;
}

const createMockChannel = (): MockChannel => ({
  createMessageCollector: jest.fn(),
  send: jest.fn(() => Promise.resolve())
})

const createMockMessage = (content = '', authorID = '1'): MockMessage => ({
  author: {
    id: authorID
  },
  channel: createMockChannel(),
  content
})


describe('Unit::Prompt', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })
  const promptVis = (): { text: string } => ({
    text: 'foobar'
  })
  const promptFunc = async (): Promise<{}> => ({})
  const promptCond = async (): Promise<boolean> => false
  it('initializes correctly', () => {
    const duration = 234
    const prompt = new MyPrompt(promptVis, promptFunc, promptCond, duration)
    expect(prompt.formatGenerator).toEqual(promptVis)
    expect(prompt.function).toEqual(promptFunc)
    expect(prompt.condition).toEqual(promptCond)
    expect(prompt.duration).toEqual(duration)
  })
  describe('getFormat', () => {
    it('returns the function return value if format generator is func', () => {
      const prompt = new MyPrompt(promptVis)
      const format = {
        text: 'qaedg'
      }
      const data = {
        jo: 'bo'
      }
      prompt.formatGenerator = jest.fn(() => format)
      expect(prompt.getFormat(data)).toEqual(format)
      expect(prompt.formatGenerator)
        .toHaveBeenCalledWith(data)
    })
    it('directly returns the value if format generator is not func', () => {
      const prompt = new MyPrompt(promptVis)
      const format = {
        text: 'qaedg'
      }
      prompt.formatGenerator = format
      expect(prompt.getFormat({})).toEqual(format)
    })
  })
  describe('shouldRunCollector', () => {
    it('returns true', () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      expect(prompt.shouldRunCollector()).toEqual(true)  
    })
  })
  describe('static handleMessage', () => {
    const authorID = '3w4ey5ru7t'
    it('emits accept if no error is thrown in func', async () => {
      const message = createMockMessage('rfdeh', authorID)
      const emitter = new EventEmitter()
      const emit = jest.spyOn(emitter, 'emit')
      const funcData = {
        fo: 'bar'
      }
      const thisPromptFunc = async (): Promise<{}> => funcData
      await Prompt.handleMessage(emitter, message, thisPromptFunc)
      expect(emit).toHaveBeenCalledWith('accept', message, funcData)
    })
    it('emits reject if func error is a Rejection', async () => {
      const message = createMockMessage('rfdeh', authorID)
      const emitter = new EventEmitter()
      const emit = jest.spyOn(emitter, 'emit')
      const rejectError = new Rejection('sdge')
      const thisPromptFunc = async (): Promise<{}> => {
        throw rejectError
      }
      await Prompt.handleMessage(emitter, message, thisPromptFunc)
      expect(emit).toHaveBeenCalledWith('reject', message, rejectError)
    })
    it('emits error if func error is not Rejection', async () => {
      const message = createMockMessage('rfdeh', authorID)
      const emitter = new EventEmitter()
      // Node always requires an error listener if it emits error
      emitter.on('error', () => {
        return 1
      })
      const emit = jest.spyOn(emitter, 'emit')
      const error = new Error('sdge')
      const thisPromptFunc = async (): Promise<{}> => {
        throw error
      }
      await Prompt.handleMessage(emitter, message, thisPromptFunc)
      expect(emit).toHaveBeenCalledWith('error', error)
    })
  })
  describe('handleCollector', () => {
    const authorID = '1'
    beforeEach(() => {
      jest.useFakeTimers()
    })
    it('calls handleMessage for every message', async () => {
      const emitter = new EventEmitter()
      const message = createMockMessage('', authorID)
      const message2 = createMockMessage('', authorID)
      const data = {
        foo: 'bar'
      }
      const handleMessage = jest.spyOn(Prompt, 'handleMessage')
        .mockResolvedValue()
      Prompt.handleCollector(emitter, promptFunc, data)
      emitter.emit('message', message)
      emitter.emit('message', message2)
      await flushPromises()
      expect(handleMessage).toHaveBeenCalledWith(emitter, message, promptFunc, data)
      expect(handleMessage).toHaveBeenCalledWith(emitter, message2, promptFunc, data)
    })
    it('clears timeout on emitter stop', async () => {
      const emitter = new EventEmitter()
      const message = createMockMessage()
      Prompt.handleCollector(emitter, promptFunc)
      emitter.emit('stop', message)
      await flushPromises()
      expect(clearTimeout).toHaveBeenCalled()
    })
    it('calls settimeout if duration is specified', () => {
      const emitter = new EventEmitter()
      const data = {
        foo: 'bar'
      }
      const duration = 9423
      jest.spyOn(Prompt, 'handleMessage').mockResolvedValue()
      Prompt.handleCollector(emitter, promptFunc, data, duration)
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), duration)
    })
    it('does not call settimeout if no duration', () => {
      const emitter = new EventEmitter()
      const data = {
        foo: 'bar'
      }
      const duration = undefined
      jest.spyOn(Prompt, 'handleMessage').mockResolvedValue()
      Prompt.handleCollector(emitter, promptFunc, data, duration)
      expect(setTimeout).not.toHaveBeenCalled()
    })
    it('emits inactivity if timeout runs', () => {
      const emitter = new EventEmitter()
      const data = {
        foo: 'bar'
      }
      const duration = 9423
      const emit = jest.spyOn(emitter, 'emit')
      Prompt.handleCollector(emitter, promptFunc, data, duration)
      jest.runOnlyPendingTimers()
      expect(emit).toHaveBeenCalledWith('inactivity')
    })
  })
  describe('sendUserFormatMessage', () => {
    it('returns the message', async () => {
      const channel = createMockChannel()
      const sentMessage = createMockMessage()
      const prompt = new MyPrompt(promptVis)
      const format = {
        text: 'aqedstgwry'
      }
      const data = {
        foo: 1
      }
      jest.spyOn(prompt, 'getFormat')
        .mockReturnValue(format)
      jest.spyOn(prompt, 'sendMessage')
        .mockResolvedValue(sentMessage)
      const returned = await prompt.sendUserFormatMessage(channel, data)
      expect(returned).toEqual(sentMessage)
    })
    it('sends with the right args', async () => {
      const channel = createMockChannel()
      const sentMessage = createMockMessage()
      const prompt = new MyPrompt(promptVis)
      const format = {
        text: 'aqedstgwry'
      }
      const data = {}
      jest.spyOn(prompt, 'getFormat')
        .mockReturnValue(format)
      const spy = jest.spyOn(prompt, 'sendMessage')
        .mockResolvedValue(sentMessage)
      await prompt.sendUserFormatMessage(channel, data)
      expect(spy).toHaveBeenCalledWith(format, channel)
    })
  })
  describe('sendMessage', () => {
    const format = {
      text: 'hwat'
    }
    it('sends the generated format', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      prompt.formatGenerator = (): { text: string } => format
      const channel = createMockChannel()
      await prompt.sendMessage(format, channel)
      expect(channel.send)
        .toHaveBeenCalledWith(format)
    })
    it('returns the message if it exists', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      prompt.formatGenerator = (): { text: string } => format
      const returnedMessage = createMockMessage()
      const channel = createMockChannel()
      channel.send.mockResolvedValue(returnedMessage)
      const returned = await prompt.sendMessage(format, channel)
      expect(returned).toEqual(returnedMessage)
    })
  })
  describe('getNext', () => {
    it('returns the right child', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const promptC1 = new MyPrompt(promptVis, promptFunc)
      const promptC2 = new MyPrompt(promptVis, promptFunc)
      const promptC3 = new MyPrompt(promptVis, promptFunc)
      prompt.children = [promptC1, promptC2, promptC3]
      Object.defineProperty(promptC1, 'condition', {
        value: async () => false
      })
      Object.defineProperty(promptC2, 'condition', {
        value: async () => true
      })
      Object.defineProperty(promptC3, 'condition', {
        value: async () => true
      })
      const message = createMockMessage()
      await expect(prompt.getNext(message))
        .resolves.toEqual(promptC2)
    })
    it('returns null for no elgiible children', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const promptC1 = new MyPrompt(promptVis, promptFunc)
      const promptC2 = new MyPrompt(promptVis, promptFunc)
      prompt.children = [promptC1, promptC2]
      Object.defineProperty(promptC1, 'condition', {
        value: async () => false
      })
      Object.defineProperty(promptC2, 'condition', {
        value: async () => false
      })
      const message = createMockMessage()
      await expect(prompt.getNext(message))
        .resolves.toEqual(null)
    })
    it('returns one with no condition if it exists', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const promptC1 = new MyPrompt(promptVis, promptFunc)
      const promptC2 = new MyPrompt(promptVis, promptFunc)
      prompt.children = [promptC1, promptC2]
      Object.defineProperty(promptC1, 'condition', {
        value: async () => false
      })
      const message = createMockMessage()
      await expect(prompt.getNext(message))
        .resolves.toEqual(promptC2)
    })
  })
  describe('terminateHere', () => {
    it('clears the children', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      prompt.children = [
        new MyPrompt(promptVis, promptFunc)
      ]
      await prompt.terminateHere()
      expect(prompt.children).toEqual([])
    })
  })
  describe('storeUserMessage', () => {
    it('stores correctly', () => {
      const prompt = new MyPrompt(promptVis)
      const message = createMockMessage()
      prompt.storeUserMessage(message)
      expect(prompt.messages).toEqual([{
        message,
        fromUser: true
      }])
    })
  })
  describe('storeBotMessage', () => {
    it('stores correctly', () => {
      const prompt = new MyPrompt(promptVis)
      const message = createMockMessage()
      prompt.storeBotMessage(message)
      expect(prompt.messages).toEqual([{
        message,
        fromUser: false
      }])
    })
  })
  describe('collect', () => {
    let emitter: EventEmitter
    let prompt: Prompt<object>
    let terminateSpy: jest.SpyInstance
    let channel: MockChannel
    beforeEach(() => {
      emitter = new EventEmitter()
      prompt = new MyPrompt(promptVis, promptFunc)
      channel = createMockChannel()
      terminateSpy = jest.spyOn(prompt, 'terminateHere')
        .mockReturnValue()
      jest.spyOn(MyPrompt.prototype, 'createCollector')
        .mockReturnValue(emitter)
      jest.spyOn(MyPrompt.prototype, 'storeUserMessage')
        .mockReturnValue()
      jest.spyOn(MyPrompt.prototype, 'storeBotMessage')
        .mockReturnValue()
      jest.spyOn(MyPrompt.prototype, 'sendMessage')
        .mockResolvedValue(createMockMessage())
      jest.spyOn(MyPrompt, 'handleCollector')
        .mockReturnValue()
    })
    it('resolves with data if no prompt function', async () => {
      const promptNoFunc = new MyPrompt(promptVis)
      const data = {
        foo: 'bar'
      }
      const result = await promptNoFunc.collect(channel, data)
      expect(result).toEqual(data)
    })
    describe('collector exit', () => {
      beforeEach(() => {
        jest.spyOn(prompt, 'onExit')
          .mockResolvedValue()
      })
      it('terminates on collector exit', async () => {
        const promptRun = prompt.collect(channel, {})
        emitter.emit('exit')
        await promptRun
        expect(terminateSpy)
          .toHaveBeenCalledTimes(1)
      })
      it('stores the user message', async () => {
        const storeUserMessage = jest.spyOn(prompt, 'storeUserMessage')
        const promptRun = prompt.collect(channel, {})
        const exitMessage = createMockMessage()
        emitter.emit('exit', exitMessage)
        await promptRun
        expect(storeUserMessage)
          .toHaveBeenCalledWith(exitMessage)
      })
      it('calls onExit', async () => {
        const onExit = jest.spyOn(prompt, 'onExit')
        const data = {
          foo: 'bar'
        }
        const promptRun = prompt.collect(channel, data)
        const exitMessage = createMockMessage()
        emitter.emit('exit', exitMessage, channel, data)
        await promptRun
        expect(onExit).toHaveBeenCalledWith(exitMessage, channel, data)
      })
      it('handles the error from onExit', async () => {
        const error = new Error('dtguj')
        const terminateHere = jest.spyOn(prompt, 'terminateHere')
        const emit = jest.spyOn(emitter, 'emit')
        jest.spyOn(prompt, 'onExit')
          .mockRejectedValue(error)
        const promptRun = prompt.collect(channel, {})
        const exitMessage = createMockMessage()
        emitter.emit('exit', exitMessage)
        // Reject the run
        await expect(promptRun).rejects.toThrow(error)
        // Don't proceed to the next phase
        expect(terminateHere).toHaveBeenCalled()
        // Notify the user to clean up their collector
        expect(emit).toHaveBeenCalledWith('stop')
      })
    })
    describe('collector inactivity', () => {
      beforeEach(() => {
        jest.spyOn(prompt, 'onInactivity')
          .mockResolvedValue()
      })
      it('terminates on collector inactivity', async () => {
        const promptRun = prompt.collect(channel, {})
        emitter.emit('inactivity')
        await promptRun
        expect(terminateSpy)
          .toHaveBeenCalledTimes(1)
      })
      it('calls onInactivity', async () => {
        const onInactivity = jest.spyOn(prompt, 'onInactivity')
        const data = {
          fo: 'baz'
        }
        const promptRun = prompt.collect(channel, data)
        emitter.emit('inactivity', channel, data)
        await promptRun
        expect(onInactivity).toHaveBeenCalledWith(channel, data)
      })
      it('handles the error from onActivity', async () => {
        const error = new Error('dtguj')
        const terminateHere = jest.spyOn(prompt, 'terminateHere')
        const emit = jest.spyOn(emitter, 'emit')
        jest.spyOn(prompt, 'onInactivity')
          .mockRejectedValue(error)
        const promptRun = prompt.collect(channel, {})
        emitter.emit('inactivity')
        // Reject the run
        await expect(promptRun).rejects.toThrow(error)
        // Don't proceed to the next phase
        expect(terminateHere).toHaveBeenCalled()
        // Notify the user to clean up their collector
        expect(emit).toHaveBeenCalledWith('stop')
      })
    })
    describe('collector error', () => {
      it('rejects prompt run and terminates', async () => {
        const error = new Error('qateswgry')
        const terminateHere = jest.spyOn(prompt, 'terminateHere')
        const promptRun = prompt.collect(channel, {})
        emitter.emit('error', error)
        await expect(promptRun).rejects.toThrow(error)
        expect(terminateHere).toHaveBeenCalledTimes(1)
      })
    })
    describe('collector reject', () => {
      beforeEach(() => {
        jest.spyOn(prompt, 'onReject')
          .mockResolvedValue()
      })
      it('stores the user message', async () => {
        jest.spyOn(prompt, 'onExit')
          .mockResolvedValue()
        const error = new Rejection('qateswgry')
        const storeUserMessage = jest.spyOn(prompt, 'storeUserMessage')
        const rejectedMessage = createMockMessage()
        const promptRun = prompt.collect(channel, {})
        emitter.emit('reject', rejectedMessage, error)
        emitter.emit('exit')
        await promptRun
        expect(storeUserMessage)
          .toHaveBeenCalledWith(rejectedMessage)
      })
      it('calls onReject', async () => {
        jest.spyOn(prompt, 'onExit')
          .mockResolvedValue()
        const onReject = jest.spyOn(prompt, 'onReject')
        const data = {
          foo: 'baz'
        }
        const promptRun = prompt.collect(channel, data)
        const message = createMockMessage()
        const rejection = new Rejection('azdsegr')
        emitter.emit('reject', message, rejection, channel, data)
        emitter.emit('exit', createMockMessage())
        await promptRun
        expect(onReject).toHaveBeenCalledWith(message, rejection, channel, data)
      })
      it('handles the error from onReject', async () => {
        const error = new Error('dtguj')
        const emit = jest.spyOn(emitter, 'emit')
        jest.spyOn(prompt, 'onReject')
          .mockRejectedValue(error)
        const promptRun = prompt.collect(channel, {})
        emitter.emit('reject', createMockMessage(), error)
        // Reject the run
        await expect(promptRun).rejects.toThrow(error)
        // Don't proceed to the next phase
        expect(terminateSpy).toHaveBeenCalled()
        // Notify the user to clean up their collector
        expect(emit).toHaveBeenCalledWith('stop')
      })
    })
    describe('collector accept', () => {
      it('resolves correctly', async () => {
        const acceptMessage = createMockMessage()
        const acceptData = {
          foo: 1
        }
        const promptRun = prompt.collect(channel, {})
        emitter.emit('accept', acceptMessage, acceptData)
        await expect(promptRun).resolves.toEqual(acceptData)
      })
      it('stores the messages', async () => {
        const acceptMessage = createMockMessage()
        const acceptData = {
          foo: 1
        }
        const promptRun = prompt.collect(channel, {})
        const storeUserMessage = jest.spyOn(prompt, 'storeUserMessage')
        emitter.emit('accept', acceptMessage, acceptData)
        await promptRun
        expect(storeUserMessage).toHaveBeenCalledWith(acceptMessage)
      })
    })
  })
})
