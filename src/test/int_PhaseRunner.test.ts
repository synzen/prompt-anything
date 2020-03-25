import { Phase, FormatGenerator, PhaseFunction, PhaseCondition, PhaseCollectorInterface } from "../Phase"
import { PhaseRunner } from '../PhaseRunner'
import { EventEmitter } from "events"
import { Rejection } from "../errors/Rejection";
import { EndPhase } from "../EndPhase";

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
      const phaseRC111 = new EndPhase(phaseForm, phaseFunc, async () => true)
      const phaseRC112 = new EndPhase(phaseForm, phaseFunc, async () => false)
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
    it('runs collect for regular Phase even if no children', async () => {
      const message = createMockMessage()
      const phase = new Phase(phaseForm, phaseFunc)
      const spy = jest.spyOn(phase, 'collect').mockResolvedValue({
        data: {},
        message: createMockMessage()
      })
      const runner = new PhaseRunner<{}>()
      await runner.execute(phase, message, () => new EventEmitter())
      expect(spy).toHaveBeenCalledTimes(1)
    })
    it('does not run collect for EndPhase', async () => {
      const message = createMockMessage()
      const phase = new EndPhase(phaseForm, phaseFunc)
      const spy = jest.spyOn(phase, 'collect').mockResolvedValue({
        data: {},
        message: createMockMessage()
      })
      const runner = new PhaseRunner<{}>()
      await runner.execute(phase, message, () => new EventEmitter())
      expect(spy).not.toHaveBeenCalled()
    })
  })
  describe('run', () => {
    it('works with phase collect and getNext', async () => {
      const message = createMockMessage()
      const phase = new Phase(phaseForm, phaseFunc)
      const phaseC1 = new Phase(phaseForm, phaseFunc, async () => false)
      const phaseC2 = new Phase(phaseForm, phaseFunc, async () => true)
      const phaseC21 = new EndPhase(phaseForm, phaseFunc)

      phase.children = [phaseC1, phaseC2]
      phaseC2.children = [phaseC21]
      phaseC21.children = []

      const emitter: PhaseCollectorInterface<{}> = new EventEmitter()
      const runner = new PhaseRunner<{}>()
      const promise = runner.run(phase, message, () => emitter)
      await flushPromises()
      emitter.emit('message', createMockMessage())
      expect(runner.indexOf(phase)).toEqual(0)
      await flushPromises()
      emitter.emit('message', createMockMessage())
      expect(runner.indexOf(phaseC1)).toEqual(-1)
      expect(runner.indexOf(phaseC2)).toEqual(1)
      await promise
      expect(runner.indexOf(phaseC21)).toEqual(2)
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
      const emitter: PhaseCollectorInterface<PhaseData> = new EventEmitter()
      const name = 'George'
      const age = '30'
      const runner = new PhaseRunner<PhaseData>()
      const promise = runner.run(askName, message, () => emitter, {})
      // Wait for all pending promise callbacks to be executed for the emitter to set up
      await flushPromises()
      // Accept the name
      emitter.emit('message', createMockMessage(name))
      expect(runner.indexOf(askName)).toEqual(0)
      // Wait for all pending promise callbacks to be executed for message to be accepted
      await flushPromises()
      // Accept the age
      emitter.emit('message', createMockMessage(age))
      expect(runner.indexOf(askAge)).toEqual(1)
      await promise
      expect(runner.indexesOf([tooOld, tooYoung]))
        .toEqual([2, -1])
    })
    it('calls all functions', async () => {
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
      const askNameFnSpy = jest.fn()
      const askNameFn: PhaseFunction<PhaseData> = async (m, data) => {
        askNameFnSpy()
        if (!data) {
          throw new Error('Missing data')
        }
        data.name = m.content
        return data
      }
      const askName = new Phase<PhaseData>(thisPhaseForm, askNameFn)
      
      // Ask age phase that collects messages
      const askAgeFnSpy = jest.fn()
      const askAgeFn: PhaseFunction<PhaseData> = async (m, data) => {
        askAgeFnSpy()
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
      const tooOldFnSpy = jest.fn()
      const tooOldFn: PhaseCondition<PhaseData> = async (m, data) => {
        tooOldFnSpy()
        return !!(data && data.age && data.age >= 20)
      }
      const tooYoungFnSpy = jest.fn()
      const tooYoungFn: PhaseCondition<PhaseData> = async (m, data) => {
        tooYoungFnSpy()
        return !!(data && data.age && data.age < 20)
      }
      const askAge = new Phase<PhaseData>(thisPhaseForm, askAgeFn)
      const tooOld = new EndPhase<PhaseData>(thisPhaseForm, undefined, tooOldFn)
      const tooYoung = new EndPhase<PhaseData>(thisPhaseForm, undefined, tooYoungFn)
      askName.setChildren([askAge])
      askAge.setChildren([tooOld, tooYoung])
      
      const message = createMockMessage()
      const emitter: PhaseCollectorInterface<PhaseData> = new EventEmitter()
      const name = 'George'
      const age = '30'
      const runner = new PhaseRunner<PhaseData>()
      const collectorCreator = function (): PhaseCollectorInterface<PhaseData> {
        return emitter
      }
      const promise = runner.run(askName, message, collectorCreator, {})
      // Wait for all pending promise callbacks to be executed for the emitter to set up
      await flushPromises()
      // Accept the name
      emitter.emit('message', createMockMessage(name))
      expect(askNameFnSpy).toHaveBeenCalledTimes(1)
      // Wait for all pending promise callbacks to be executed for message to be accepted
      await flushPromises()
      // Accept the age
      emitter.emit('message', createMockMessage(age))
      expect(askAgeFnSpy).toHaveBeenCalledTimes(1)
      await promise
      expect(tooOldFnSpy).toHaveBeenCalledTimes(1)
      expect(tooYoungFnSpy).not.toHaveBeenCalled()
    })
    it('works with functions added mid-run', async () => {
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
      const tooOldFn: PhaseCondition<PhaseData> = async (m, data) => {
        return !!(data && data.age && data.age >= 20)
      }
      const tooYoungFn: PhaseCondition<PhaseData> = async (m, data) => {
        return !!(data && data.age && data.age < 20)
      }
      const tooOld = new EndPhase<PhaseData>(thisPhaseForm, undefined, tooOldFn)
      const tooYoung = new EndPhase<PhaseData>(thisPhaseForm, undefined, tooYoungFn)
      // Ask age phase that collects messages
      const askAgeFn: PhaseFunction<PhaseData> = async function (m, data) {
        if (!data) {
          throw new Error('Missing data')
        }
        if (isNaN(Number(m.content))) {
          // Send a rejection message and continue collecting
          throw new Rejection()
        }
        data.age = Number(m.content)
        this.setChildren([tooYoung, tooOld])
        return data
      }
      const askAge = new Phase<PhaseData>(thisPhaseForm, askAgeFn)
      
      const askNameFn: PhaseFunction<PhaseData> = async function (m, data) {
        if (!data) {
          throw new Error('Missing data')
        }
        data.name = m.content
        this.setChildren([askAge])
        return data
      }
      const askName = new Phase<PhaseData>(thisPhaseForm, askNameFn)

      const message = createMockMessage()
      const emitter: PhaseCollectorInterface<PhaseData> = new EventEmitter()
      const collectorCreator = function (): PhaseCollectorInterface<PhaseData> {
        return emitter
      }
      const name = 'George'
      const age = '30'
      const runner = new PhaseRunner<PhaseData>()
      const promise = runner.run(askName, message, collectorCreator, {})
      // Wait for all pending promise callbacks to be executed for the emitter to set up
      await flushPromises()
      // Accept the name
      emitter.emit('message', createMockMessage(name))
      expect(runner.indexOf(askName)).toEqual(0)
      // Wait for all pending promise callbacks to be executed for message to be accepted
      await flushPromises()
      // Accept the age
      emitter.emit('message', createMockMessage(age))
      expect(runner.indexOf(askAge)).toEqual(1)
      await promise
      expect(runner.indexesOf([tooOld, tooYoung]))
        .toEqual([2, -1])
    })
  })
})
