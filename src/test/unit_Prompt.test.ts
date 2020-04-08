import { Prompt } from "../Prompt"
import { EventEmitter } from 'events'
import { Rejection } from '../errors/Rejection'

class MyPrompt<T> extends Prompt<T> {
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
    it('calls sendMessage with the right args', async () => {
      const channel = createMockChannel()
      const generatedMessage = createMockMessage()
      const prompt = new MyPrompt(promptVis, promptFunc)
      const generatedFormat = {
        text: 'aqedstgwry'
      }
      jest.spyOn(prompt, 'formatGenerator')
        .mockReturnValue(generatedFormat)
      const sendMessage = jest.spyOn(prompt, 'sendMessage')
        .mockResolvedValue(generatedMessage)
      await prompt.sendUserFormatMessage(channel, {})
      expect(sendMessage).toHaveBeenCalledWith(generatedFormat, channel)
    })
    it('returns what sendMessage returns', async () => {
      const channel = createMockChannel()
      const generatedMessage = createMockMessage()
      const prompt = new MyPrompt(promptVis, promptFunc)
      jest.spyOn(prompt, 'formatGenerator')
        .mockReturnValue({ text: 'aedf' })
      jest.spyOn(prompt, 'sendMessage')
        .mockResolvedValue(generatedMessage)
      const returned = await prompt.sendUserFormatMessage(channel, {})
      expect(returned).toEqual(generatedMessage)
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
    })
    describe('collector inactivity', () => {
      it('terminates on collector inactivity', async () => {
        const promptRun = prompt.collect(channel, {})
        emitter.emit('inactivity')
        await promptRun
        expect(terminateSpy)
          .toHaveBeenCalledTimes(1)
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
      it('stores the user message', async () => {
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
