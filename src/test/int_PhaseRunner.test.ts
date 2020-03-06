import { Phase } from "../Phase"
import { PhaseRunner } from '../PhaseRunner'
import { FormatGenerator, PhaseFunction } from '../types/phase'
import { EventEmitter } from "events"

async function flushPromises(): Promise<void> {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}


type MockMessage = {
  author: {
    id: string;
  };
  channel: {
    send: jest.Mock;
  };
  content: string;
}

const createMockMessage = (content = ''): MockMessage => ({
  author: {
    id: '1'
  },
  channel: {
    send: jest.fn(() => Promise.resolve())
  },
  content
})

describe('Unit::PhaseRunner', () => {
  const phaseForm: FormatGenerator = () => ({
    text: '1',
    embed: {
      title: '1'
    }
  })
  const phaseFunc: PhaseFunction = async () => ({})
  afterEach(() => {
    jest.restoreAllMocks()
  })
  describe('static execute', () => {
    it('runs the right phases (ignoring collect)', async () => {
      const message = createMockMessage()
      const phaseR = new Phase(phaseForm, phaseFunc)
      const phaseRC1 = new Phase(phaseForm, phaseFunc)
      Object.defineProperty(phaseRC1, 'condition', {
        value: () => false
      })
      const phaseRC2 = new Phase(phaseForm, phaseFunc)
      Object.defineProperty(phaseRC2, 'condition', {
        value: () => true
      })
      const phaseRC11 = new Phase(phaseForm, phaseFunc)
      const phaseRC21 = new Phase(phaseForm, phaseFunc)
      Object.defineProperty(phaseRC21, 'condition', {
        value: () => true
      })
      const phaseRC22 = new Phase(phaseForm, phaseFunc)
      Object.defineProperty(phaseRC22, 'condition', {
        value: () => false
      })
      const phaseRC211 = new Phase(phaseForm, phaseFunc)
      const phases = [phaseR, phaseRC1, phaseRC2, phaseRC11, phaseRC21, phaseRC22, phaseRC211]
      const spies = phases.map(p => {
        p.children = []
        return jest.spyOn(p, 'collect').mockResolvedValue({
          data: {},
          message: createMockMessage()
        })
      })

      phaseR.children = [phaseRC1, phaseRC2]
      phaseRC1.children = [phaseRC11]
      phaseRC2.children = [phaseRC21, phaseRC22]
      phaseRC21.children = [phaseRC211]

      await PhaseRunner.execute(phaseR, message, () => new EventEmitter())
      expect(spies[0]).toHaveBeenCalledTimes(1)
      expect(spies[1]).not.toHaveBeenCalled()
      expect(spies[2]).toHaveBeenCalledTimes(1)
      expect(spies[3]).not.toHaveBeenCalled()
      expect(spies[4]).toHaveBeenCalledTimes(1)
      expect(spies[5]).not.toHaveBeenCalled()
      expect(spies[6]).not.toHaveBeenCalled()
    })
    describe('run', () => {
      it('works with phase collect and getNext', async () => {
        const message = createMockMessage()
        const phase = new Phase(phaseForm, phaseFunc)
        const phaseC1 = new Phase(phaseForm, phaseFunc, () => false)
        const phaseC2 = new Phase(phaseForm, phaseFunc, () => true)
        const phaseC21 = new Phase(phaseForm, phaseFunc)
  
        phase.children = [phaseC1, phaseC2]
        phaseC2.children = [phaseC21]
        phaseC21.children = []
  
        const emitter = new EventEmitter()
        const promise = PhaseRunner.run(phase, message, () => emitter)
        await flushPromises()
        emitter.emit('accept', createMockMessage(), {})
        await flushPromises()
        emitter.emit('accept', createMockMessage(), {})
        await promise
      })
    })
  })
})
