import { Phase, FormatGenerator, PhaseFunction, PhaseCollectorCreator } from "../Phase"
import { PhaseRunner } from '../PhaseRunner'
import { EventEmitter } from "events"

jest.mock('../Phase')

class MyPhase extends Phase<{}> {
  createCollector: PhaseCollectorCreator<{}> = () => {
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

describe('Unit::PhaseRunner', () => {
  const phaseForm: FormatGenerator<{}> = () => ({
    text: '1',
    embed: {
      title: '1'
    }
  })
  const phaseFunc: PhaseFunction<{}> = async () => ({})
  afterEach(() => {
    jest.restoreAllMocks()
  })
  describe('run', () => {
    it('throws error if invalid phase', async () => {
      jest.spyOn(PhaseRunner, 'valid')
        .mockReturnValue(false)
      const channel = createMockChannel()
      const phase = new MyPhase(phaseForm, phaseFunc)
      const runner = new PhaseRunner<{}>()
      await expect(runner.run(phase, channel, {}))
        .rejects
        .toThrow('Invalid phase found. Phases with more than 1 child must have all its children to have a condition function specified.')
    })
    it('calls this.execute', async () => {
      jest.spyOn(PhaseRunner, 'valid')
        .mockReturnValue(true)
      
      const message = createMockMessage()
      const channel = createMockChannel()
      const phase = new MyPhase(phaseForm, phaseFunc)
      const runner = new PhaseRunner<{}>()
      const spy = jest.spyOn(runner, 'execute')
        .mockResolvedValue()
      const data = {
        foo: 1
      }
      await runner.run(phase, channel, data, message)
      expect(spy).toHaveBeenCalledWith(phase, channel, data, message)
    })
  })
  describe('validate', () => {
    it('throws returns true for <= 1 children with no conditions', () => {
      const phaseR = new MyPhase(phaseForm, phaseFunc)
      const phaseR1 = new MyPhase(phaseForm, phaseFunc)
      const phaseR11 = new MyPhase(phaseForm, phaseFunc)
      phaseR.children = [phaseR1]
      phaseR1.children = [phaseR11]
      phaseR11.children = []
      expect(PhaseRunner.valid(phaseR)).toEqual(true)
    })
    it('returns false for > 1 children with some having no conditions', () => {
      const phaseR = new MyPhase(phaseForm, phaseFunc)
      const phaseR1 = new MyPhase(phaseForm, phaseFunc)
      const phaseR11 = new MyPhase(phaseForm, phaseFunc)
      const phaseR12 = new MyPhase(phaseForm, phaseFunc)
      phaseR.children = [phaseR1]
      phaseR1.children = [phaseR11, phaseR12]
      phaseR11.children = []
      phaseR12.children = []
      expect(PhaseRunner.valid(phaseR)).toEqual(false)
    })
    it('returns true for > 1 children all having conditions', () => {
      const phaseR = new MyPhase(phaseForm, phaseFunc)
      const phaseR1 = new MyPhase(phaseForm, phaseFunc)
      const phaseR11 = new MyPhase(phaseForm, phaseFunc)
      Object.defineProperty(phaseR11, 'condition', {
        value: () => false
      })
      const phaseR12 = new MyPhase(phaseForm, phaseFunc)
      Object.defineProperty(phaseR12, 'condition', {
        value: () => true
      })
      const phaseR121 = new MyPhase(phaseForm, phaseFunc)
      Object.defineProperty(phaseR121, 'condition', {
        value: () => true
      })
      const phaseR122 = new MyPhase(phaseForm, phaseFunc)
      Object.defineProperty(phaseR122, 'condition', {
        value: () => true
      })
      phaseR.children = [phaseR1]
      phaseR1.children = [phaseR11, phaseR12]
      phaseR11.children = []
      phaseR12.children = [phaseR121, phaseR122]
      phaseR121.children = []
      phaseR122.children = []
      expect(PhaseRunner.valid(phaseR)).toEqual(true)
    })
  })
  describe('execute', () => {
    it('sends the message', async () => {
      const channel = createMockChannel()
      const phase = new MyPhase(phaseForm, phaseFunc)
      phase.children = []
      jest.spyOn(phase, 'collect')
        .mockResolvedValue({
          data: {},
          message: createMockMessage()
        })
      const phaseSend = jest.spyOn(phase, 'sendUserFormatMessage')
      const data = {
        foo: 1
      }
      const runner = new PhaseRunner<{}>()
      await runner.execute(phase, channel, data)
      expect(phaseSend).toHaveBeenCalledWith(channel, data)
    })
    it('sends all phase messages', async () => {
      const message = createMockMessage('initial message')
      const channel = createMockChannel()
      const phase1 = new MyPhase(phaseForm, phaseFunc)
      const phase2 = new MyPhase(phaseForm, phaseFunc)
      const phase3 = new MyPhase(phaseForm, phaseFunc)
      jest.spyOn(phase1, 'getNext')
        .mockResolvedValue(phase2)
      jest.spyOn(phase2, 'getNext')
        .mockResolvedValue(phase3)
      jest.spyOn(phase3, 'getNext')
        .mockResolvedValue(null)
      const phases = [phase1, phase2, phase3]
      const phasesCollectedMessages = [
        createMockMessage('phase1 return'),
        createMockMessage('phase2 return')
      ]
      const phasesCollectedData = [
        { a: 1 },
        { a: 2, b: 2 }
      ]
      const sendMessageSpies = phases.map((p, index) => {
        jest.spyOn(p, 'shouldRunCollector').mockReturnValue(true)
        jest.spyOn(p, 'collect').mockResolvedValue({
          data: phasesCollectedData[index],
          message: phasesCollectedMessages[index]
        })
        return jest.spyOn(p, 'sendUserFormatMessage')
      })
      const runner = new PhaseRunner<{}>()
      const initialData = {
        a: 0
      }
      await runner.execute(phase1, channel, initialData)
      expect(sendMessageSpies[0]).toHaveBeenCalledWith(
        channel,
        initialData
      )
      expect(sendMessageSpies[1]).toHaveBeenCalledWith(
        channel,
        phasesCollectedData[0]
      )
      expect(sendMessageSpies[2]).toHaveBeenCalledWith(
        channel,
        phasesCollectedData[1]
      )
    })
    it('runs all phases', async () => {
      const channel = createMockChannel()
      const phase1 = new MyPhase(phaseForm, phaseFunc)
      const phase2 = new MyPhase(phaseForm, phaseFunc)
      const phase3 = new MyPhase(phaseForm, phaseFunc)
      jest.spyOn(phase1, 'getNext')
        .mockResolvedValue(phase2)
      jest.spyOn(phase2, 'getNext')
        .mockResolvedValue(phase3)
      jest.spyOn(phase3, 'getNext')
        .mockResolvedValue(null)
      const phases = [phase1, phase2, phase3]
      const collectSpies = phases.map(p => {
        jest.spyOn(p, 'shouldRunCollector').mockReturnValue(true)
        return jest.spyOn(p, 'collect').mockResolvedValue({
          data: {},
          message: createMockMessage()
        })
      })
      const runner = new PhaseRunner<{}>()
      await runner.execute(phase1, channel, {})
      for (const spy of collectSpies) {
        expect(spy).toHaveBeenCalledTimes(1)
      }
    })
    it('does not call phase collect for phase with no children', async () => {
      const channel = createMockChannel()
      const phase = new MyPhase(phaseForm, phaseFunc)
      phase.children = []
      const spy = jest.spyOn(phase, 'collect')
      const runner = new PhaseRunner<{}>()
      await runner.execute(phase, channel, {})
      expect(spy).not.toHaveBeenCalled()
    })
    it('adds each ran phase into this.ran', async () => {
      const channel = createMockChannel()
      const phase1 = new MyPhase(phaseForm, phaseFunc)
      const phase2 = new MyPhase(phaseForm, phaseFunc)
      const phase3 = new MyPhase(phaseForm, phaseFunc)
      jest.spyOn(phase1, 'getNext')
        .mockResolvedValue(phase2)
      jest.spyOn(phase2, 'getNext')
        .mockResolvedValue(phase3)
      jest.spyOn(phase3, 'getNext')
        .mockResolvedValue(null)
      const phases = [phase1, phase2, phase3]
      phases.forEach(p => {
        jest.spyOn(p, 'shouldRunCollector').mockReturnValue(true)
        return jest.spyOn(p, 'collect').mockResolvedValue({
          data: {},
          message: createMockMessage()
        })
      })
      const runner = new PhaseRunner<{}>()
      await runner.execute(phase1, channel, {})
      expect(runner.ran).toEqual([phase1, phase2, phase3])
    })
  })
  describe('static run', () => {
    it('runs the created phase runner', async () => {
      const channel = createMockChannel()
      const phase = new MyPhase(phaseForm, phaseFunc)
      phase.children = []
      const spy = jest.spyOn(PhaseRunner.prototype, 'run')
      await PhaseRunner.run(phase, channel, {})
      expect(spy).toHaveBeenCalledTimes(1)
    })
    it('returns the PhaseRunner', async () => {
      const channel = createMockChannel()
      const phase = new MyPhase(phaseForm, phaseFunc)
      phase.children = []
      const returned = await PhaseRunner.run(phase, channel, {})
      expect(returned).toBeInstanceOf(PhaseRunner)
    })
  })
  describe('indexesOf', () => {
    it('calls indexOf', () => {
      const phase1 = new MyPhase(phaseForm, phaseFunc)
      const phase2 = new MyPhase(phaseForm, phaseFunc)
      const phase3 = new MyPhase(phaseForm, phaseFunc)
      const runner = new PhaseRunner<{}>()
      Object.defineProperty(runner, 'ran', {
        value: [phase2, phase3, phase1]
      })
      const spy = jest.spyOn(runner, 'indexOf')
        .mockReturnValue(1)
      runner.indexesOf([phase1, phase2, phase3])
      expect(spy).toHaveBeenCalledTimes(3)
      expect(spy).toHaveBeenCalledWith(phase1)
      expect(spy).toHaveBeenCalledWith(phase2)
      expect(spy).toHaveBeenCalledWith(phase3)
    })
  })
  describe('indexOf', () => {
    it('returns the index of the phase', () => {
      const phase1 = new MyPhase(phaseForm, phaseFunc)
      const phase2 = new MyPhase(phaseForm, phaseFunc)
      const phase3 = new MyPhase(phaseForm, phaseFunc)
      const runner = new PhaseRunner<{}>()
      Object.defineProperty(runner, 'ran', {
        value: [phase2, phase3, phase1]
      })
      expect(runner.indexOf(phase1))
        .toEqual(2)
    })
  })
})
