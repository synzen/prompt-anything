import { Phase } from "../Phase"
import { EventEmitter } from 'events'
import { Rejection } from '../errors/Rejection'

class MyPhase<T> extends Phase<T> {
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


describe('Unit::Phase', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })
  const phaseVis = (): { text: string } => ({
    text: 'foobar'
  })
  const phaseFunc = async (): Promise<{}> => ({})
  const phaseCond = async (): Promise<boolean> => false
  it('initializes correctly', () => {
    const duration = 234
    const phase = new MyPhase(phaseVis, phaseFunc, phaseCond, duration)
    expect(phase.formatGenerator).toEqual(phaseVis)
    expect(phase.function).toEqual(phaseFunc)
    expect(phase.condition).toEqual(phaseCond)
    expect(phase.duration).toEqual(duration)
  })
  describe('shouldRunCollector', () => {
    it('returns true', () => {
      const phase = new MyPhase(phaseVis, phaseFunc)
      expect(phase.shouldRunCollector()).toEqual(true)  
    })
  })
  describe('static handleMessage', () => {
    const authorID = '3w4ey5ru7t'
    it('emits exit if message is exit', async () => {
      const message = createMockMessage('exit', authorID)
      const emitter = new EventEmitter()
      const emit = jest.spyOn(emitter, 'emit')
      const stopCollecting = await Phase.handleMessage(emitter, message, phaseFunc)
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
      const thisPhaseFunc = async (): Promise<{}> => funcData
      const stopCollecting = await Phase.handleMessage(emitter, message, thisPhaseFunc)
      expect(emit).toHaveBeenCalledWith('accept', message, funcData)
      expect(stopCollecting).toEqual(true)
    })
    it('emits reject if func error is a Rejection', async () => {
      const message = createMockMessage('rfdeh', authorID)
      const emitter = new EventEmitter()
      const emit = jest.spyOn(emitter, 'emit')
      const rejectError = new Rejection('sdge')
      const thisPhaseFunc = async (): Promise<{}> => {
        throw rejectError
      }
      const stopCollecting = await Phase.handleMessage(emitter, message, thisPhaseFunc)
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
      const thisPhaseFunc = async (): Promise<{}> => {
        throw error
      }
      const stopCollecting = await Phase.handleMessage(emitter, message, thisPhaseFunc)
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
      const handleMessage = jest.spyOn(Phase, 'handleMessage').mockResolvedValue(false)
      Phase.handleCollector(emitter, phaseFunc, data)
      emitter.emit('message', message)
      emitter.emit('message', message2)
      await flushPromises()
      expect(handleMessage).toHaveBeenCalledWith(emitter, message, phaseFunc, data)
      expect(handleMessage).toHaveBeenCalledWith(emitter, message2, phaseFunc, data)
    })
    it('emits stop if handleMessage returns true to stop collection', async () => {
      const emitter = new EventEmitter()
      const message = createMockMessage()
      jest.spyOn(Phase, 'handleMessage').mockResolvedValue(true)
      const emit = jest.spyOn(emitter, 'emit')
      Phase.handleCollector(emitter, phaseFunc)
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
      jest.spyOn(Phase, 'handleMessage').mockResolvedValue(false)
      Phase.handleCollector(emitter, phaseFunc, data, duration)
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), duration)
    })
    it('does not call settimeout if no duration', () => {
      const emitter = new EventEmitter()
      const data = {
        foo: 'bar'
      }
      const duration = undefined
      jest.spyOn(Phase, 'handleMessage').mockResolvedValue(false)
      Phase.handleCollector(emitter, phaseFunc, data, duration)
      expect(setTimeout).not.toHaveBeenCalled()
    })
    it('emits stop and inactivity if timeout runs', () => {
      const emitter = new EventEmitter()
      const data = {
        foo: 'bar'
      }
      const duration = 9423
      const emit = jest.spyOn(emitter, 'emit')
      jest.spyOn(Phase, 'handleMessage').mockResolvedValue(false)
      Phase.handleCollector(emitter, phaseFunc, data, duration)
      jest.runOnlyPendingTimers()
      expect(emit).toHaveBeenCalledWith('stop')
      expect(emit).toHaveBeenCalledWith('inactivity')
    })
  })
  describe('sendUserFormatMessage', () => {
    it('calls sendMessage with the right args', async () => {
      const channel = createMockChannel()
      const generatedMessage = createMockMessage()
      const phase = new MyPhase(phaseVis, phaseFunc)
      const generatedFormat = {
        text: 'aqedstgwry'
      }
      jest.spyOn(phase, 'formatGenerator')
        .mockReturnValue(generatedFormat)
      const sendMessage = jest.spyOn(phase, 'sendMessage')
        .mockResolvedValue(generatedMessage)
      await phase.sendUserFormatMessage(channel, {})
      expect(sendMessage).toHaveBeenCalledWith(generatedFormat, channel)
    })
    it('returns what sendMessage returns', async () => {
      const channel = createMockChannel()
      const generatedMessage = createMockMessage()
      const phase = new MyPhase(phaseVis, phaseFunc)
      jest.spyOn(phase, 'formatGenerator')
        .mockReturnValue({ text: 'aedf' })
      jest.spyOn(phase, 'sendMessage')
        .mockResolvedValue(generatedMessage)
      const returned = await phase.sendUserFormatMessage(channel, {})
      expect(returned).toEqual(generatedMessage)
    })
  })
  describe('sendMessage', () => {
    const format = {
      text: 'hwat'
    }
    it('sends the generated format', async () => {
      const phase = new MyPhase(phaseVis, phaseFunc)
      phase.formatGenerator = (): { text: string } => format
      const channel = createMockChannel()
      await phase.sendMessage(format, channel)
      expect(channel.send)
        .toHaveBeenCalledWith(format)
    })
    it('returns the message if it exists', async () => {
      const phase = new MyPhase(phaseVis, phaseFunc)
      phase.formatGenerator = (): { text: string } => format
      const returnedMessage = createMockMessage()
      const channel = createMockChannel()
      channel.send.mockResolvedValue(returnedMessage)
      const returned = await phase.sendMessage(format, channel)
      expect(returned).toEqual(returnedMessage)
    })
  })
  describe('getNext', () => {
    it('returns the right child', async () => {
      const phase = new MyPhase(phaseVis, phaseFunc)
      const phaseC1 = new MyPhase(phaseVis, phaseFunc)
      const phaseC2 = new MyPhase(phaseVis, phaseFunc)
      const phaseC3 = new MyPhase(phaseVis, phaseFunc)
      phase.children = [phaseC1, phaseC2, phaseC3]
      Object.defineProperty(phaseC1, 'condition', {
        value: async () => false
      })
      Object.defineProperty(phaseC2, 'condition', {
        value: async () => true
      })
      Object.defineProperty(phaseC3, 'condition', {
        value: async () => true
      })
      const message = createMockMessage()
      await expect(phase.getNext(message))
        .resolves.toEqual(phaseC2)
    })
    it('returns null for no elgiible children', async () => {
      const phase = new MyPhase(phaseVis, phaseFunc)
      const phaseC1 = new MyPhase(phaseVis, phaseFunc)
      const phaseC2 = new MyPhase(phaseVis, phaseFunc)
      phase.children = [phaseC1, phaseC2]
      Object.defineProperty(phaseC1, 'condition', {
        value: async () => false
      })
      Object.defineProperty(phaseC2, 'condition', {
        value: async () => false
      })
      const message = createMockMessage()
      await expect(phase.getNext(message))
        .resolves.toEqual(null)
    })
    it('returns one with no condition if it exists', async () => {
      const phase = new MyPhase(phaseVis, phaseFunc)
      const phaseC1 = new MyPhase(phaseVis, phaseFunc)
      const phaseC2 = new MyPhase(phaseVis, phaseFunc)
      phase.children = [phaseC1, phaseC2]
      Object.defineProperty(phaseC1, 'condition', {
        value: async () => false
      })
      const message = createMockMessage()
      await expect(phase.getNext(message))
        .resolves.toEqual(phaseC2)
    })
  })
  describe('terminateHere', () => {
    it('clears the children', async () => {
      const phase = new MyPhase(phaseVis, phaseFunc)
      const message = createMockMessage()
      phase.children = [
        new MyPhase(phaseVis, phaseFunc)
      ]
      await phase.terminateHere(message.channel, 'abc')
      expect(phase.children).toEqual([])
    })
    it('sends the message', async () => {
      const phase = new MyPhase(phaseVis, phaseFunc)
      const channel = createMockChannel()
      phase.children = []
      const messageString = 'q3et4wr'
      const sendMessage = jest.spyOn(phase, 'sendMessage')
        .mockResolvedValue(createMockMessage())
      await phase.terminateHere(channel, messageString)
      expect(sendMessage).toHaveBeenCalledWith({
        text: messageString
      }, channel)
    })
    it('returns the message sent', async () => {
      const phase = new MyPhase(phaseVis, phaseFunc)
      const createdMessage = createMockMessage()
      const channel = createMockChannel()
      phase.children = []
      jest.spyOn(phase, 'sendMessage')
        .mockResolvedValue(createdMessage)
      const returned = await phase.terminateHere(channel, 'asfde')
      expect(returned).toEqual(createdMessage)
    })
  })
  describe('storeUserMessage', () => {
    it('stores correctly', () => {
      const phase = new MyPhase(phaseVis)
      const message = createMockMessage()
      phase.storeUserMessage(message)
      expect(phase.messages).toEqual([{
        message,
        fromUser: true
      }])
    })
  })
  describe('storeBotMessage', () => {
    it('stores correctly', () => {
      const phase = new MyPhase(phaseVis)
      const message = createMockMessage()
      phase.storeBotMessage(message)
      expect(phase.messages).toEqual([{
        message,
        fromUser: false
      }])
    })
  })
  describe('collect', () => {
    let emitter: EventEmitter
    let phase: Phase<object>
    let terminateSpy: jest.SpyInstance
    let channel: MockChannel
    beforeEach(() => {
      emitter = new EventEmitter()
      phase = new MyPhase(phaseVis, phaseFunc)
      channel = createMockChannel()
      terminateSpy = jest.spyOn(phase, 'terminateHere')
        .mockResolvedValue(createMockMessage())
      jest.spyOn(MyPhase.prototype, 'createCollector')
        .mockReturnValue(emitter)
      jest.spyOn(MyPhase.prototype, 'storeUserMessage')
        .mockReturnValue()
      jest.spyOn(MyPhase.prototype, 'storeBotMessage')
        .mockReturnValue()
      jest.spyOn(MyPhase.prototype, 'sendMessage')
        .mockResolvedValue(createMockMessage())
      jest.spyOn(MyPhase, 'handleCollector')
        .mockReturnValue()
    })
    it('resolves with data if no phase function', async () => {
      const phaseNoFunc = new MyPhase(phaseVis)
      const data = {
        foo: 'bar'
      }
      const result = await phaseNoFunc.collect(channel, data)
      expect(result).toEqual(data)
    })
    describe('collector exit', () => {
      it('terminates on collector exit', async () => {
        const phaseRun = phase.collect(channel, {})
        emitter.emit('exit')
        await phaseRun
        expect(terminateSpy)
          .toHaveBeenCalledWith(channel, Phase.STRINGS.exit)
      })
    })
    describe('collector inactivity', () => {
      it('terminates on collector inactivity', async () => {
        const phaseRun = phase.collect(channel, {})
        emitter.emit('inactivity')
        await phaseRun
        expect(terminateSpy)
          .toHaveBeenCalledWith(channel, Phase.STRINGS.inactivity)
      })
    })
    describe('collector error', () => {
      it('rejects phase run', async () => {
        const error = new Error('qateswgry')
        const phaseRun = phase.collect(channel, {})
        const lastUserInput = createMockMessage()
        emitter.emit('error', lastUserInput, error)
        await expect(phaseRun).rejects.toThrow(error)
      })
    })
    describe('collector reject', () => {
      it('sends the custom error message', async () => {
        const error = new Rejection('qateswgry')
        const sendMessage = jest.spyOn(phase, 'sendMessage')
          .mockResolvedValue(createMockMessage())
        const phaseRun = phase.collect(channel, {})
        emitter.emit('reject', createMockMessage(), error)
        emitter.emit('exit')
        await phaseRun
        expect(sendMessage).toHaveBeenCalledWith({
          text: error.message
        }, channel)
      })
      it('sends a fallback error message if no error message', async () => {
        const error = new Rejection()
        const sendMessage = jest.spyOn(phase, 'sendMessage')
          .mockResolvedValue(createMockMessage())
        const phaseRun = phase.collect(channel, {})
        emitter.emit('reject', createMockMessage(), error)
        emitter.emit('exit')
        await phaseRun
        expect(sendMessage).toHaveBeenCalledWith({
          text: Phase.STRINGS.rejected
        }, channel)
      })
      it('rejects if sendMessage fails', async () => {
        const error = new Rejection()
        const sendMessageError = new Error('qawesdtg')
        jest.spyOn(phase, 'sendMessage')
          .mockRejectedValue(sendMessageError)
        const phaseRun = phase.collect(channel, {})
        emitter.emit('reject', createMockMessage(), error)
        emitter.emit('exit')
        await expect(phaseRun).rejects.toThrow(sendMessageError)
      })
    })
    describe('collector accept', () => {
      it('resolves correctly', async () => {
        const acceptMessage = createMockMessage()
        const acceptData = {
          foo: 1
        }
        const phaseRun = phase.collect(channel, {})
        emitter.emit('accept', acceptMessage, acceptData)
        await expect(phaseRun).resolves.toEqual(acceptData)
      })
      it('stores the messages', async () => {
        const acceptMessage = createMockMessage()
        const acceptData = {
          foo: 1
        }
        const phaseRun = phase.collect(channel, {})
        const storeUserMessage = jest.spyOn(phase, 'storeUserMessage')
        emitter.emit('accept', acceptMessage, acceptData)
        await phaseRun
        expect(storeUserMessage).toHaveBeenCalledWith(acceptMessage)
      })
    })
  })
})
