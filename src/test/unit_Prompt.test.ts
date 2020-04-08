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
    it('emits exit if message is exit', async () => {
      const message = createMockMessage('exit', authorID)
      const emitter = new EventEmitter()
      const emit = jest.spyOn(emitter, 'emit')
      const stopCollecting = await Prompt.handleMessage(emitter, message, promptFunc)
      expect(emit).toHaveBeenCalledWith('exit', message)
      expect(stopCollecting).toEqual(true)
    })
    it('emits accept if no error is thrown in func', async () => {
      const message = createMockMessage('rfdeh', authorID)
      const emitter = new EventEmitter()
      const emit = jest.spyOn(emitter, 'emit')
      const funcData = {
        fo: 'bar'
      }
      const thisPromptFunc = async (): Promise<{}> => funcData
      const stopCollecting = await Prompt.handleMessage(emitter, message, thisPromptFunc)
      expect(emit).toHaveBeenCalledWith('accept', message, funcData)
      expect(stopCollecting).toEqual(true)
    })
    it('emits reject if func error is a Rejection', async () => {
      const message = createMockMessage('rfdeh', authorID)
      const emitter = new EventEmitter()
      const emit = jest.spyOn(emitter, 'emit')
      const rejectError = new Rejection('sdge')
      const thisPromptFunc = async (): Promise<{}> => {
        throw rejectError
      }
      const stopCollecting = await Prompt.handleMessage(emitter, message, thisPromptFunc)
      expect(emit).toHaveBeenCalledWith('reject', message, rejectError)
      expect(stopCollecting).toEqual(false)
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
      const stopCollecting = await Prompt.handleMessage(emitter, message, thisPromptFunc)
      expect(emit).toHaveBeenCalledWith('error', message, error)
      expect(stopCollecting).toEqual(true)
    })
  })
  describe('handleCollector', () => {
    const authorID = '1'
    beforeEach(() => {
      jest.useFakeTimers()
    })
    it('calls handleMessage for every message', async () => {
      const emitter = new EventEmitter()
      const originalMessage = createMockMessage('', authorID)
      const message = createMockMessage('', authorID)
      const message2 = createMockMessage('', authorID)
      const data = {
        foo: 'bar'
      }
      const handleMessage = jest.spyOn(Prompt, 'handleMessage').mockResolvedValue(false)
      Prompt.handleCollector(emitter, promptFunc, data)
      emitter.emit('message', message)
      emitter.emit('message', message2)
      await flushPromises()
      expect(handleMessage).toHaveBeenCalledWith(emitter, message, promptFunc, data)
      expect(handleMessage).toHaveBeenCalledWith(emitter, message2, promptFunc, data)
    })
    it('emits stop if handleMessage returns true to stop collection', async () => {
      const emitter = new EventEmitter()
      const message = createMockMessage()
      jest.spyOn(Prompt, 'handleMessage').mockResolvedValue(true)
      const emit = jest.spyOn(emitter, 'emit')
      Prompt.handleCollector(emitter, promptFunc)
      emitter.emit('message', message)
      await flushPromises()
      expect(emit).toHaveBeenCalledWith('stop')
      expect(clearTimeout).toHaveBeenCalled()
    })
    it('calls settimeout if duration is specified', () => {
      const emitter = new EventEmitter()
      const data = {
        foo: 'bar'
      }
      const duration = 9423
      jest.spyOn(Prompt, 'handleMessage').mockResolvedValue(false)
      Prompt.handleCollector(emitter, promptFunc, data, duration)
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), duration)
    })
    it('does not call settimeout if no duration', () => {
      const emitter = new EventEmitter()
      const data = {
        foo: 'bar'
      }
      const duration = undefined
      jest.spyOn(Prompt, 'handleMessage').mockResolvedValue(false)
      Prompt.handleCollector(emitter, promptFunc, data, duration)
      expect(setTimeout).not.toHaveBeenCalled()
    })
    it('emits stop and inactivity if timeout runs', () => {
      const emitter = new EventEmitter()
      const data = {
        foo: 'bar'
      }
      const duration = 9423
      const emit = jest.spyOn(emitter, 'emit')
      jest.spyOn(Prompt, 'handleMessage').mockResolvedValue(false)
      Prompt.handleCollector(emitter, promptFunc, data, duration)
      jest.runOnlyPendingTimers()
      expect(emit).toHaveBeenCalledWith('stop')
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
      const message = createMockMessage()
      prompt.children = [
        new MyPrompt(promptVis, promptFunc)
      ]
      await prompt.terminateHere(message.channel, 'abc')
      expect(prompt.children).toEqual([])
    })
    it('sends the message', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const channel = createMockChannel()
      prompt.children = []
      const messageString = 'q3et4wr'
      const sendMessage = jest.spyOn(prompt, 'sendMessage')
        .mockResolvedValue(createMockMessage())
      await prompt.terminateHere(channel, messageString)
      expect(sendMessage).toHaveBeenCalledWith({
        text: messageString
      }, channel)
    })
    it('returns the message sent', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const createdMessage = createMockMessage()
      const channel = createMockChannel()
      prompt.children = []
      jest.spyOn(prompt, 'sendMessage')
        .mockResolvedValue(createdMessage)
      const returned = await prompt.terminateHere(channel, 'asfde')
      expect(returned).toEqual(createdMessage)
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
        .mockResolvedValue(createMockMessage())
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
          .toHaveBeenCalledWith(channel, Prompt.STRINGS.exit)
      })
    })
    describe('collector inactivity', () => {
      it('terminates on collector inactivity', async () => {
        const promptRun = prompt.collect(channel, {})
        emitter.emit('inactivity')
        await promptRun
        expect(terminateSpy)
          .toHaveBeenCalledWith(channel, Prompt.STRINGS.inactivity)
      })
    })
    describe('collector error', () => {
      it('rejects prompt run', async () => {
        const error = new Error('qateswgry')
        const promptRun = prompt.collect(channel, {})
        const lastUserInput = createMockMessage()
        emitter.emit('error', lastUserInput, error)
        await expect(promptRun).rejects.toThrow(error)
      })
    })
    describe('collector reject', () => {
      it('sends the custom error message', async () => {
        const error = new Rejection('qateswgry')
        const sendMessage = jest.spyOn(prompt, 'sendMessage')
          .mockResolvedValue(createMockMessage())
        const promptRun = prompt.collect(channel, {})
        emitter.emit('reject', createMockMessage(), error)
        emitter.emit('exit')
        await promptRun
        expect(sendMessage).toHaveBeenCalledWith({
          text: error.message
        }, channel)
      })
      it('sends a fallback error message if no error message', async () => {
        const error = new Rejection()
        const sendMessage = jest.spyOn(prompt, 'sendMessage')
          .mockResolvedValue(createMockMessage())
        const promptRun = prompt.collect(channel, {})
        emitter.emit('reject', createMockMessage(), error)
        emitter.emit('exit')
        await promptRun
        expect(sendMessage).toHaveBeenCalledWith({
          text: Prompt.STRINGS.rejected
        }, channel)
      })
      it('rejects if sendMessage fails', async () => {
        const error = new Rejection()
        const sendMessageError = new Error('qawesdtg')
        jest.spyOn(prompt, 'sendMessage')
          .mockRejectedValue(sendMessageError)
        const promptRun = prompt.collect(channel, {})
        emitter.emit('reject', createMockMessage(), error)
        emitter.emit('exit')
        await expect(promptRun).rejects.toThrow(sendMessageError)
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
