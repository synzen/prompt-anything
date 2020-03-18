import { Phase, FormatGenerator, PhaseFunction, PhaseCondition } from "../Phase"
import { PhaseRunner } from '../PhaseRunner'
import { EventEmitter } from "events"
import { Rejection } from "../errors/Rejection";

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

describe('Int::PhaseRunner', () => {
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
  describe('execute', () => {
    it('runs the right phases (ignoring collect)', async () => {
      const message = createMockMessage()
      const phaseR = new Phase(phaseForm, phaseFunc)
      const phaseRC1 = new Phase(phaseForm, phaseFunc, async () => false)
      const phaseRC2 = new Phase(phaseForm, phaseFunc, async () => true)
      const phaseRC11 = new Phase(phaseForm, phaseFunc)
      const phaseRC111 = new Phase(phaseForm, phaseFunc, async () => true)
      const phaseRC112 = new Phase(phaseForm, phaseFunc, async () => false)
      const phases = [phaseR, phaseRC1, phaseRC2, phaseRC11, phaseRC111, phaseRC112]
      const spies = phases.map(p => {
        p.children = []
        return jest.spyOn(p, 'collect').mockResolvedValue({
          data: {},
          message: createMockMessage()
        })
      })

      phaseR.children = [phaseRC1, phaseRC2]
      phaseRC2.children = [phaseRC11]
      // Either of these should not collect since they have no children
      phaseRC11.children = [phaseRC111, phaseRC112]
      const runner = new PhaseRunner<{}>()
      await runner.execute(phaseR, message, () => new EventEmitter())
      expect(spies[0]).toHaveBeenCalledTimes(1)
      expect(spies[1]).not.toHaveBeenCalled()
      expect(spies[2]).toHaveBeenCalledTimes(1)
      expect(spies[3]).toHaveBeenCalledTimes(1)
      expect(spies[4]).not.toHaveBeenCalled()
      expect(spies[5]).not.toHaveBeenCalled()
      expect(runner.indexesOf(phases)).toEqual([
        0, -1, 1, 2, 3, -1
      ])
    })
  })
  describe('run', () => {
    it('works with phase collect and getNext', async () => {
      const message = createMockMessage()
      const phase = new Phase(phaseForm, phaseFunc)
      const phaseC1 = new Phase(phaseForm, phaseFunc, async () => false)
      const phaseC2 = new Phase(phaseForm, phaseFunc, async () => true)
      const phaseC21 = new Phase(phaseForm, phaseFunc)

      phase.children = [phaseC1, phaseC2]
      phaseC2.children = [phaseC21]
      phaseC21.children = []

      const emitter = new EventEmitter()
      const runner = new PhaseRunner<{}>()
      const promise = runner.run(phase, message, () => emitter)
      await flushPromises()
      emitter.emit('accept', createMockMessage(), {})
      await flushPromises()
      emitter.emit('accept', createMockMessage(), {})
      await promise
      expect(runner.indexesOf([phase, phaseC1, phaseC2, phaseC21])).toEqual([
        0, -1, 1, 2
      ])
    })
    it('works with custom functions', async () => {
      type PhaseData = {
        age?: number;
        name?: string;
      }
      const thisPhaseForm: FormatGenerator<PhaseData> = () => ({
        text: '1',
        embed: {
          title: '1'
        }
      })
      const askNameFn: PhaseFunction<PhaseData> = async (m, data) => {
        if (!data) {
          throw new Error('Missing data')
        }
        data.name = m.content
        return data
      }
      const askName = new Phase<PhaseData>(thisPhaseForm, askNameFn)
      
      // Ask age phase that collects messages
      const askAgeFn: PhaseFunction<PhaseData> = async (m, data) => {
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
      const tooOldFn: PhaseCondition<PhaseData> = async (m, data) => {
        return !!(data && data.age && data.age >= 20)
      }
      const tooYoungFn: PhaseCondition<PhaseData> = async (m, data) => {
        return !!(data && data.age && data.age < 20)
      }
      const askAge = new Phase<PhaseData>(thisPhaseForm, askAgeFn)
      const tooOld = new Phase<PhaseData>(thisPhaseForm, undefined, tooOldFn)
      const tooYoung = new Phase<PhaseData>(thisPhaseForm, undefined, tooYoungFn)
      askName.setChildren([askAge])
      askAge.setChildren([tooOld, tooYoung])
      
      const message = createMockMessage()
      const emitter = new EventEmitter()
      const name = 'George'
      const age = '30'
      const runner = new PhaseRunner<PhaseData>()
      const promise = runner.run(askName, message, () => emitter)
      // Wait for all pending promise callbacks to be executed for the emitter to set up
      await flushPromises()
      expect(runner.indexOf(askName)).toEqual(0)
      // Accept the name
      emitter.emit('accept', createMockMessage(name), {
        name
      })
      // Wait for all pending promise callbacks to be executed for message to be accepted
      // Accept the age
      await flushPromises()
      expect(runner.indexOf(askAge)).toEqual(1)
      emitter.emit('accept', createMockMessage(age), {
        age
      })
      await promise
      expect(runner.indexesOf([tooOld, tooYoung]))
        .toEqual([2, -1])
    })
  })
})
