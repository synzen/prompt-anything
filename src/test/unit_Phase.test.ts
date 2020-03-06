import { Phase } from "../Phase"
import { Format, PhaseData, PhaseCollectorCreator } from "../types/phase"
import { PhaseCollectorInterface } from '../types/discord'
import { EventEmitter } from 'events'
import { Rejection } from '../errors/Rejection'

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

const createMockMessage = (): MockMessage => ({
  author: {
    id: '1'
  },
  channel: createMockChannel(),
  content: ''
})


describe('Unit::Phase', () => {
  const phaseVis = (): Format => ({
    text: 'foobar'
  })
  const phaseFunc = async (): Promise<PhaseData> => ({})
  const phaseCond = (): boolean => false
  it('initializes correctly', () => {
    const duration = 234
    const phase = new Phase(phaseVis, phaseFunc, phaseCond, duration)
    expect(phase.formatGenerator).toEqual(phaseVis)
    expect(phase.function).toEqual(phaseFunc)
    expect(phase.condition).toEqual(phaseCond)
    expect(phase.duration).toEqual(duration)
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
  describe('terminateHere', () => {
    it('empties children', () => {
      const phase = new Phase(phaseVis, phaseFunc)
      const phase1 = new Phase(phaseVis, phaseFunc)
      const phase2 = new Phase(phaseVis, phaseFunc)
      phase.children = [phase1, phase2]
      phase.terminateHere()
      expect(phase.children).toEqual([])
    })
  })
  describe('getNext', () => {
    it('returns the right child', () => {
      const phase = new Phase(phaseVis, phaseFunc)
      const phaseC1 = new Phase(phaseVis, phaseFunc)
      const phaseC2 = new Phase(phaseVis, phaseFunc)
      const phaseC3 = new Phase(phaseVis, phaseFunc)
      phase.children = [phaseC1, phaseC2, phaseC3]
      Object.defineProperty(phaseC1, 'condition', {
        value: () => false
      })
      Object.defineProperty(phaseC2, 'condition', {
        value: () => true
      })
      Object.defineProperty(phaseC3, 'condition', {
        value: () => true
      })
      const message = createMockMessage()
      expect(phase.getNext(message)).toEqual(phaseC2)
    })
    it('returns null for no elgiible children', () => {
      const phase = new Phase(phaseVis, phaseFunc)
      const phaseC1 = new Phase(phaseVis, phaseFunc)
      const phaseC2 = new Phase(phaseVis, phaseFunc)
      phase.children = [phaseC1, phaseC2]
      Object.defineProperty(phaseC1, 'condition', {
        value: () => false
      })
      Object.defineProperty(phaseC2, 'condition', {
        value: () => false
      })
      const message = createMockMessage()
      expect(phase.getNext(message)).toEqual(null)
    })
    it('returns one with no condition if it exists', () => {
      const phase = new Phase(phaseVis, phaseFunc)
      const phaseC1 = new Phase(phaseVis, phaseFunc)
      const phaseC2 = new Phase(phaseVis, phaseFunc)
      phase.children = [phaseC1, phaseC2]
      Object.defineProperty(phaseC1, 'condition', {
        value: () => false
      })
      const message = createMockMessage()
      expect(phase.getNext(message)).toEqual(phaseC2)
    })
  })
  describe('run', () => {
    let emitter: EventEmitter
    let phase: Phase
    let terminateSpy: jest.SpyInstance
    let message: MockMessage
    let emitterCreator: PhaseCollectorCreator
    beforeEach(() => {
      emitter = new EventEmitter()
      phase = new Phase(phaseVis, phaseFunc)
      message = createMockMessage()
      terminateSpy = jest.spyOn(phase, 'terminateHere')
      emitterCreator = (): PhaseCollectorInterface => emitter
    })
    it('resolves with original message and data if no phase function', async () => {
      const phaseNoFunc = new Phase(phaseVis)
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
        expect(message.channel.send)
          .toHaveBeenCalledWith(Phase.STRINGS.exit)
        expect(terminateSpy).toHaveBeenCalledTimes(1)
      })
      it('rejects the phase run if message send fails', async () => {
        const error = new Error('qateswgry')
        message.channel.send.mockRejectedValue(error)
        const phaseRun = phase.collect(message, emitterCreator)
        emitter.emit('exit')
        await expect(phaseRun).rejects.toThrow(error)
        expect(terminateSpy).not.toHaveBeenCalled()
      })
    })
    describe('collector inactivity', () => {
      it('terminates on collector inactivity', async () => {
        const phaseRun = phase.collect(message, emitterCreator)
        emitter.emit('inactivity')
        await phaseRun
        expect(message.channel.send)
          .toHaveBeenCalledWith(Phase.STRINGS.inactivity)
        expect(terminateSpy).toHaveBeenCalledTimes(1)
      })
      it('rejects phase run if message send fails', async () => {
        const error = new Error('qateswgry')
        message.channel.send.mockRejectedValue(error)
        const phaseRun = phase.collect(message, emitterCreator)
        emitter.emit('inactivity')
        await expect(phaseRun).rejects.toThrow(error)
        expect(terminateSpy).not.toHaveBeenCalled()
      })
    })
    describe('collector error', () => {
      it('rejects phase run', async () => {
        const error = new Error('qateswgry')
        const phaseRun = phase.collect(message, emitterCreator)
        emitter.emit('error', createMockMessage(), error)
        await expect(phaseRun).rejects.toThrow(error)
      })
    })
    describe('collector reject', () => {
      it('sends the custom error message', async () => {
        const error = new Rejection('qateswgry')
        const phaseRun = phase.collect(message, emitterCreator)
        message.channel.send.mockResolvedValue(1)
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
        message.channel.send.mockResolvedValue(1)
        emitter.emit('accept', acceptMessage, acceptData)
        await expect(phaseRun).resolves.toEqual({
          message: acceptMessage,
          data: acceptData
        })
      })
    })
  })
})