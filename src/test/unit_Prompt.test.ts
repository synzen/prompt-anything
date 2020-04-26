import { Prompt, VisualGenerator } from "../Prompt"
import { EventEmitter } from 'events'
import { Rejection } from '../errors/Rejection'
import { MessageInterface } from "../interfaces/Message";

class MyPrompt<DataType> extends Prompt<DataType, MessageInterface> {
  onReject(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  onInactivity(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  onExit(): Promise<void> {
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
  const promptVis = async (): Promise<{ text: string }> => ({
    text: 'foobar'
  })
  const promptFunc = async (): Promise<{}> => ({})
  it('initializes correctly', () => {
    const duration = 234
    const prompt = new MyPrompt(promptVis, promptFunc, duration)
    expect(prompt.visualGenerator).toEqual(promptVis)
    expect(prompt.function).toEqual(promptFunc)
    expect(prompt.duration).toEqual(duration)
  })
  describe('getVisual', () => {
    it('returns the function return value if visual generator is func', async () => {
      const prompt = new MyPrompt<{}>(promptVis)
      const visual = {
        text: 'qaedg'
      }
      const data = {
        jo: 'bo'
      }
      const generator: VisualGenerator<{}> = jest.fn().mockResolvedValue(visual)
      Object.defineProperty(prompt, 'visualGenerator', {
        value: generator
      })
      await expect(prompt.getVisual(data))
        .resolves.toEqual(visual)
      expect(generator)
        .toHaveBeenCalledWith(data)
    })
    it('directly returns the value if visual generator is not func', async () => {
      const prompt = new MyPrompt(promptVis)
      const visual = {
        text: 'qaedg'
      }
      Object.defineProperty(prompt, 'visualGenerator', {
        value: visual
      })
      await expect(prompt.getVisual({}))
        .resolves.toEqual(visual)
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
  describe('sendUserVisual', () => {
    it('returns the message', async () => {
      const channel = createMockChannel()
      const sentMessage = createMockMessage()
      const prompt = new MyPrompt(promptVis)
      const visual = {
        text: 'aqedstgwry'
      }
      const data = {
        foo: 1
      }
      jest.spyOn(prompt, 'getVisual')
        .mockResolvedValue(visual)
      jest.spyOn(prompt, 'sendVisual')
        .mockResolvedValue(sentMessage)
      const returned = await prompt.sendUserVisual(channel, data)
      expect(returned).toEqual(sentMessage)
    })
    it('sends with the right args', async () => {
      const channel = createMockChannel()
      const sentMessage = createMockMessage()
      const prompt = new MyPrompt(promptVis)
      const visual = {
        text: 'aqedstgwry'
      }
      const data = {}
      jest.spyOn(prompt, 'getVisual')
        .mockResolvedValue(visual)
      const spy = jest.spyOn(prompt, 'sendVisual')
        .mockResolvedValue(sentMessage)
      await prompt.sendUserVisual(channel, data)
      expect(spy).toHaveBeenCalledWith(visual, channel)
    })
  })
  describe('sendVisual', () => {
    const visual = {
      text: 'hwat'
    }
    it('sends the generated visual', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const channel = createMockChannel()
      await prompt.sendVisual(visual, channel)
      expect(channel.send)
        .toHaveBeenCalledWith(visual)
    })
    it('returns the message if it exists', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const returnedMessage = createMockMessage()
      const channel = createMockChannel()
      channel.send.mockResolvedValue(returnedMessage)
      const returned = await prompt.sendVisual(visual, channel)
      expect(returned).toEqual(returnedMessage)
    })
    it('sends all messages if array of visuals', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const visuals = [{
        text: '1'
      }, {
        text: '2'
      }]
      // prompt.visualGenerator = async (): Promise<{ text: string }[]> => visuals
      const message1 = createMockMessage('1')
      const message2 = createMockMessage('2')
      const channel = createMockChannel()
      const send = channel.send
        .mockResolvedValueOnce(message1)
        .mockResolvedValueOnce(message2)
      await prompt.sendVisual(visuals, channel) as MessageInterface[]
      expect(send).toHaveBeenNthCalledWith(1, visuals[0])
      expect(send).toHaveBeenNthCalledWith(2, visuals[1])
    })
    it('returns the array of messages if array of visuals', async () => {
      const prompt = new MyPrompt(promptVis, promptFunc)
      const visuals = [{
        text: '1'
      }, {
        text: '2'
      }]
      // prompt.visualGenerator = async (): Promise<{ text: string }[]> => visuals
      const message1 = createMockMessage('1')
      const message2 = createMockMessage('2')
      const channel = createMockChannel()
      channel.send
        .mockResolvedValueOnce(message1)
        .mockResolvedValueOnce(message2)
      const returned = await prompt.sendVisual(visuals, channel) as MessageInterface[]
      expect(returned.length).toEqual(2)
      expect(returned[0]).toEqual(message1)
      expect(returned[1]).toEqual(message2)
    })
  })
  describe('collect', () => {
    let emitter: EventEmitter
    let prompt: Prompt<object, MessageInterface>
    let channel: MockChannel
    beforeEach(() => {
      emitter = new EventEmitter()
      prompt = new MyPrompt(promptVis, promptFunc)
      channel = createMockChannel()
      jest.spyOn(MyPrompt.prototype, 'createCollector')
        .mockReturnValue(emitter)
      jest.spyOn(MyPrompt.prototype, 'sendVisual')
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
      expect(result).toEqual({
        data,
        terminate: false
      })
    })
    describe('collector exit', () => {
      beforeEach(() => {
        jest.spyOn(prompt, 'onExit')
          .mockResolvedValue()
      })
      it('terminates on collector exit', async () => {
        const data = {
          foo: 'bbb'
        }
        const promptRun = prompt.collect(channel, data)
        emitter.emit('exit')
        const result = await promptRun
        expect(result).toEqual({
          data,
          terminate: true
        })
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
        const emit = jest.spyOn(emitter, 'emit')
        jest.spyOn(prompt, 'onExit')
          .mockRejectedValue(error)
        const promptRun = prompt.collect(channel, {})
        const exitMessage = createMockMessage()
        emitter.emit('exit', exitMessage)
        // Reject the run
        await expect(promptRun).rejects.toThrow(error)
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
        const data = {
          foo: 'bar'
        }
        const promptRun = prompt.collect(channel, data)
        emitter.emit('inactivity')
        const result = await promptRun
        expect(result).toEqual({
          data,
          terminate: true
        })
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
        const emit = jest.spyOn(emitter, 'emit')
        jest.spyOn(prompt, 'onInactivity')
          .mockRejectedValue(error)
        const promptRun = prompt.collect(channel, {})
        emitter.emit('inactivity')
        // Reject the run
        await expect(promptRun).rejects.toThrow(error)
        // Notify the user to clean up their collector
        expect(emit).toHaveBeenCalledWith('stop')
      })
    })
    describe('collector error', () => {
      it('rejects prompt run and terminates', async () => {
        const error = new Error('qateswgry')
        const promptRun = prompt.collect(channel, {})
        emitter.emit('error', error)
        await expect(promptRun).rejects.toThrow(error)
      })
    })
    describe('collector reject', () => {
      beforeEach(() => {
        jest.spyOn(prompt, 'onReject')
          .mockResolvedValue()
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
        await expect(promptRun).resolves.toEqual({
          data: acceptData,
          terminate: false
        })
      })
    })
  })
  describe('run', () => {
    it('sends the user visual and starts collecting', async () => {
      const prompt = new MyPrompt(promptVis)
      const sendUserVisual = jest.spyOn(prompt, 'sendUserVisual')
        .mockImplementation()
      const collect = jest.spyOn(prompt, 'collect')
        .mockImplementation()
      const channel = createMockChannel()
      const data = {
        foo :'baz'
      }
      await prompt.run(channel, data)
      expect(sendUserVisual).toHaveBeenCalledWith(channel, data)
      expect(collect).toHaveBeenCalledWith(channel, data)
    })
  })
})
