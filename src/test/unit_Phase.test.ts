import { Phase, Format, PhaseCollectorCreator, PhaseCollectorInterface } from "../Phase"
import { EventEmitter } from 'events'
import { Rejection } from '../errors/Rejection'

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

const createMockMessage = (content = ''): MockMessage => ({
  author: {
    id: '1'
  },
  channel: createMockChannel(),
  content
})


describe('Unit::Phase', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })
  const phaseVis = (): Format => ({
    text: 'foobar'
  })
  const phaseFunc = async (): Promise<{}> => ({})
  const phaseCond = async (): Promise<boolean> => false
  it('initializes correctly', () => {
    const duration = 234
    const phase = new Phase(phaseVis, phaseFunc, phaseCond, duration)
    expect(phase.formatGenerator).toEqual(phaseVis)
    expect(phase.function).toEqual(phaseFunc)
    expect(phase.condition).toEqual(phaseCond)
    expect(phase.duration).toEqual(duration)
  })
  describe('shouldRunCollector', () => {
    it('returns true', () => {
      const phase = new Phase(phaseVis, phaseFunc)
      expect(phase.shouldRunCollector()).toEqual(true)  
    })
  })
  describe('static handleMessage', () => {
    it('emits exit if message is exit', async () => {
      const message = createMockMessage('exit')
      const emitter = new EventEmitter()
      const spy = jest.spyOn(emitter, 'emit')
      const stopCollecting = await Phase.handleMessage(emitter, message, phaseFunc)
      expect(spy).toHaveBeenCalledWith('exit', message)
      expect(stopCollecting).toEqual(true)
    })
    it('emits accept if no error is thrown in func', async () => {
      const message = createMockMessage('rfdeh')
      const emitter = new EventEmitter()
      const spy = jest.spyOn(emitter, 'emit')
      const funcData = {
        fo: 'bar'
      }
      const thisPhaseFunc = async (): Promise<{}> => funcData
      const stopCollecting = await Phase.handleMessage(emitter, message, thisPhaseFunc)
      expect(spy).toHaveBeenCalledWith('accept', message, funcData)
      expect(stopCollecting).toEqual(true)
    })
    it('emits reject if func error is a Rejection', async () => {
      const message = createMockMessage('rfdeh')
      const emitter = new EventEmitter()
      const spy = jest.spyOn(emitter, 'emit')
      const rejectError = new Rejection('sdge')
      const thisPhaseFunc = async (): Promise<{}> => {
        throw rejectError
      }
      const stopCollecting = await Phase.handleMessage(emitter, message, thisPhaseFunc)
      expect(spy).toHaveBeenCalledWith('reject', message, rejectError)
      expect(stopCollecting).toEqual(false)
    })
    it('emits error if func error is not Rejection', async () => {
      const message = createMockMessage('rfdeh')
      const emitter = new EventEmitter()
      // Node always requires an error listener if it emits error
      emitter.on('error', () => {
        return 1
      })
      const spy = jest.spyOn(emitter, 'emit')
      const error = new Error('sdge')
      const thisPhaseFunc = async (): Promise<{}> => {
        throw error
      }
      const stopCollecting = await Phase.handleMessage(emitter, message, thisPhaseFunc)
      expect(spy).toHaveBeenCalledWith('error', message, error)
      expect(stopCollecting).toEqual(true)
    })
  })
  describe('handleCollector', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })
    it('calls handleMessage for every message', async () => {
      const emitter = new EventEmitter()
      const message = createMockMessage()
      const message2 = createMockMessage()
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
  describe('sendMessage', () => {
    const format = {
      text: 'hwat',
      embed: {
        title: 'foobar'
      }
    }
    it('sends the text and embed', async () => {
      const phase = new Phase(phaseVis, phaseFunc)
      phase.formatGenerator = (): Format => format
      const message = createMockMessage()
      await phase.sendMessage(message, {})
      expect(message.channel.send)
        .toHaveBeenCalledWith(format.text, format.embed)
    })
    it('returns the message if it exists', async () => {
      const phase = new Phase(phaseVis, phaseFunc)
      phase.formatGenerator = (): Format => format
      const returnedMessage = createMockMessage()
      const message = createMockMessage()
      message.channel.send.mockResolvedValue(returnedMessage)
      const returned = await phase.sendMessage(message, {})
      expect(returned).toEqual(returnedMessage)
    })
    it('only sends embed if no text', async () => {
      const phase = new Phase(phaseVis, phaseFunc)
      phase.formatGenerator = (): Format => ({
        embed: format.embed
      })
      const message = createMockMessage()
      await phase.sendMessage(message, {})
      expect(message.channel.send)
        .toHaveBeenCalledWith('', format.embed)
    })
    it('does not send and returns null if nothing to send', async () => {
      const phase = new Phase(phaseVis, phaseFunc)
      phase.formatGenerator = (): Format => ({})
      const message = createMockMessage()
      const returned = await phase.sendMessage(message, {})
      expect(message.channel.send)
        .not.toHaveBeenCalled()
      expect(returned).toBeNull()
    })
  })
  describe('getNext', () => {
    it('returns the right child', async () => {
      const phase = new Phase(phaseVis, phaseFunc)
      const phaseC1 = new Phase(phaseVis, phaseFunc)
      const phaseC2 = new Phase(phaseVis, phaseFunc)
      const phaseC3 = new Phase(phaseVis, phaseFunc)
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
      const phase = new Phase(phaseVis, phaseFunc)
      const phaseC1 = new Phase(phaseVis, phaseFunc)
      const phaseC2 = new Phase(phaseVis, phaseFunc)
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
      const phase = new Phase(phaseVis, phaseFunc)
      const phaseC1 = new Phase(phaseVis, phaseFunc)
      const phaseC2 = new Phase(phaseVis, phaseFunc)
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
      const phase = new Phase(phaseVis, phaseFunc)
      const message = createMockMessage()
      phase.children = [
        new Phase(phaseVis, phaseFunc)
      ]
      await phase.terminateHere(message.channel, 'abc')
      expect(phase.children).toEqual([])
    })
    it('sends the message', async () => {
      const phase = new Phase(phaseVis, phaseFunc)
      const message = createMockMessage()
      phase.children = []
      const messageString = 'q3et4wr'
      await phase.terminateHere(message.channel, messageString)
      expect(message.channel.send)
        .toHaveBeenCalledWith(messageString)
    })
    it('returns the message sent', async () => {
      const phase = new Phase(phaseVis, phaseFunc)
      const message = createMockMessage()
      phase.children = []
      const resolvedMessage = {
        a: 1,
        b: 2
      }
      message.channel.send.mockResolvedValue(resolvedMessage)
      const returned = await phase.terminateHere(message.channel, 'asfde')
      expect(returned).toEqual(resolvedMessage)
    })
    it('stores the message', async () => {
      const phase = new Phase(phaseVis, phaseFunc)
      const message = createMockMessage()
      phase.children = []
      const spy = jest.spyOn(phase, 'storeMessage')
      const resolvedMessage = {
        b: 2
      }
      message.channel.send.mockResolvedValue(resolvedMessage)
      const returned = await phase.terminateHere(message.channel, 'asfde')
      expect(spy).toHaveBeenCalledWith(returned)
    })
  })
  describe('collect', () => {
    let emitter: EventEmitter
    let phase: Phase<object>
    let terminateSpy: jest.SpyInstance
    let message: MockMessage
    let emitterCreator: PhaseCollectorCreator<{}>
    beforeEach(() => {
      emitter = new EventEmitter()
      phase = new Phase(phaseVis, phaseFunc)
      message = createMockMessage()
      terminateSpy = jest.spyOn(phase, 'terminateHere')
        .mockResolvedValue(createMockMessage())
      emitterCreator = (): PhaseCollectorInterface<{}> => emitter
      jest.spyOn(Phase, 'handleCollector').mockReturnValue()
    })
    it('resolves with original message and data if no phase function', async () => {
      const phaseNoFunc = new Phase<{}>(phaseVis)
      const data = {
        foo: 'bar'
      }
      const result = await phaseNoFunc.collect(message, emitterCreator, data)
      expect(result).toEqual({
        message,
        data
      })
    })
    describe('collector exit', () => {
      it('terminates on collector exit', async () => {
        const phaseRun = phase.collect(message, emitterCreator, {})
        emitter.emit('exit')
        await phaseRun
        expect(terminateSpy)
          .toHaveBeenCalledWith(message.channel, Phase.STRINGS.exit)
      })
    })
    describe('collector inactivity', () => {
      it('terminates on collector inactivity', async () => {
        const phaseRun = phase.collect(message, emitterCreator)
        emitter.emit('inactivity')
        await phaseRun
        expect(terminateSpy)
          .toHaveBeenCalledWith(message.channel, Phase.STRINGS.inactivity)
      })
    })
    describe('collector error', () => {
      it('rejects phase run', async () => {
        const error = new Error('qateswgry')
        const phaseRun = phase.collect(message, emitterCreator)
        const lastUserInput = createMockMessage()
        emitter.emit('error', lastUserInput, error)
        await expect(phaseRun).rejects.toThrow(error)
      })
    })
    describe('collector reject', () => {
      it('sends the custom error message', async () => {
        const error = new Rejection('qateswgry')
        const phaseRun = phase.collect(message, emitterCreator)
        emitter.emit('reject', createMockMessage(), error)
        emitter.emit('exit')
        await phaseRun
        expect(message.channel.send).toHaveBeenCalledWith(error.message)
      })
      it('sends a fallback error message if no error message', async () => {
        const error = new Rejection()
        const phaseRun = phase.collect(message, emitterCreator)
        message.channel.send.mockResolvedValue(1)
        emitter.emit('reject', createMockMessage(), error)
        emitter.emit('exit')
        await phaseRun
        expect(message.channel.send).toHaveBeenCalledWith(Phase.STRINGS.rejected)
      })
    })
    describe('collector accept', () => {
      it('resolves correctly', async () => {
        const acceptMessage = createMockMessage()
        const acceptData = {
          foo: 1
        }
        const phaseRun = phase.collect(message, emitterCreator)
        emitter.emit('accept', acceptMessage, acceptData)
        await expect(phaseRun).resolves.toEqual({
          message: acceptMessage,
          data: acceptData
        })
      })
      it('stores the messages', async () => {
        const acceptMessage = createMockMessage()
        const acceptData = {
          foo: 1
        }
        const phaseRun = phase.collect(message, emitterCreator)
        emitter.emit('accept', acceptMessage, acceptData)
        await phaseRun
        await expect(phase.messages).toEqual([acceptMessage])
      })
    })
  })
})
