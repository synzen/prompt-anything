import { Phase, FormatGenerator, PhaseFunction, PhaseCondition } from "../Phase"
import { PhaseRunner } from '../PhaseRunner'
import { EventEmitter } from "events"
import { Rejection } from "../errors/Rejection";
import { EndPhase } from "../EndPhase";

async function flushPromises(): Promise<void> {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

type MockChannel = {
  send: jest.Mock;
}

type MockMessage = {
  content: string;
}

const createMockChannel = (): MockChannel => ({
  send: jest.fn(() => Promise.resolve())
})

const createMockMessage = (content = ''): MockMessage => ({
  content
})

const phaseForm: FormatGenerator<{}> = () => ({
  text: '1',
  embed: {
    title: '1'
  }
})
const phaseFunc: PhaseFunction<{}> = async () => ({})

class MyPhase<T> extends Phase<T> {
  createCollector (): EventEmitter {
    return new EventEmitter()
  }
}

describe('Int::PhaseRunner', () => {
  let emitter = new EventEmitter()
  beforeEach(() => {
    emitter = new EventEmitter()
    jest.spyOn(MyPhase.prototype, 'createCollector')
      .mockReturnValue(emitter)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })
  describe('execute', () => {
    it('runs the right phases (ignoring collect)', async () => {
      const channel = createMockChannel()
      const phaseR = new MyPhase(phaseForm, phaseFunc)
      const phaseRC1 = new MyPhase(phaseForm, phaseFunc, async () => false)
      const phaseRC2 = new MyPhase(phaseForm, phaseFunc, async () => true)
      const phaseRC11 = new MyPhase(phaseForm, phaseFunc)
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
      await runner.execute(phaseR, channel, {})
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
      const channel = createMockChannel()
      const phase = new MyPhase(phaseForm, phaseFunc)
      const spy = jest.spyOn(phase, 'collect').mockResolvedValue({
        data: {},
        message: createMockMessage()
      })
      const runner = new PhaseRunner<{}>()
      await runner.execute(phase, channel, () => new EventEmitter())
      expect(spy).toHaveBeenCalledTimes(1)
    })
    it('does not run collect for EndPhase', async () => {
      const channel = createMockChannel()
      const phase = new EndPhase(phaseForm, phaseFunc)
      const spy = jest.spyOn(phase, 'collect').mockResolvedValue({
        data: {},
        message: createMockMessage()
      })
      const runner = new PhaseRunner<{}>()
      await runner.execute(phase, channel, () => new EventEmitter())
      expect(spy).not.toHaveBeenCalled()
    })
  })
  describe('run', () => {
    it('works with phase collect and getNext', async () => {
      const channel = createMockChannel()
      const phase = new MyPhase(phaseForm, phaseFunc)
      const phaseC1 = new MyPhase(phaseForm, phaseFunc, async () => false)
      const phaseC2 = new MyPhase(phaseForm, phaseFunc, async () => true)
      const phaseC21 = new EndPhase(phaseForm, phaseFunc)

      phase.children = [phaseC1, phaseC2]
      phaseC2.children = [phaseC21]
      phaseC21.children = []

      const runner = new PhaseRunner<{}>()
      const promise = runner.run(phase, channel, {})
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
      const tooOldFn: PhaseCondition<PhaseData> = async (data) => {
        return !!(data && data.age && data.age >= 20)
      }
      const tooYoungFn: PhaseCondition<PhaseData> = async (data) => {
        return !!(data && data.age && data.age < 20)
      }

      const askName = new MyPhase<PhaseData>(thisPhaseForm, askNameFn)
      const askAge = new MyPhase<PhaseData>(thisPhaseForm, askAgeFn)
      const tooOld = new MyPhase<PhaseData>(thisPhaseForm, undefined, tooOldFn)
      const tooYoung = new MyPhase<PhaseData>(thisPhaseForm, undefined, tooYoungFn)
      askName.setChildren([askAge])
      askAge.setChildren([tooOld, tooYoung])
      
      const channel = createMockChannel()
      const name = 'George'
      const age = '30'
      
      const runner = new PhaseRunner<PhaseData>()
      const promise = runner.run(askName, channel, {})
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
      const askName = new MyPhase<PhaseData>(thisPhaseForm, askNameFn)
      
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
      const tooOldFn: PhaseCondition<PhaseData> = async (data) => {
        tooOldFnSpy()
        return !!(data && data.age && data.age >= 20)
      }
      const tooYoungFnSpy = jest.fn()
      const tooYoungFn: PhaseCondition<PhaseData> = async (data) => {
        tooYoungFnSpy()
        return !!(data && data.age && data.age < 20)
      }
      const askAge = new MyPhase<PhaseData>(thisPhaseForm, askAgeFn)
      const tooOld = new EndPhase<PhaseData>(thisPhaseForm, undefined, tooOldFn)
      const tooYoung = new EndPhase<PhaseData>(thisPhaseForm, undefined, tooYoungFn)
      askName.setChildren([askAge])
      askAge.setChildren([tooOld, tooYoung])
      
      const channel = createMockChannel()
      const name = 'George'
      const age = '30'
      const runner = new PhaseRunner<PhaseData>()
      const promise = runner.run(askName, channel, {})
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
      const tooOldFn: PhaseCondition<PhaseData> = async (data) => {
        return !!(data && data.age && data.age >= 20)
      }
      const tooYoungFn: PhaseCondition<PhaseData> = async (data) => {
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
      const askAge = new MyPhase<PhaseData>(thisPhaseForm, askAgeFn)
      
      const askNameFn: PhaseFunction<PhaseData> = async function (m, data) {
        if (!data) {
          throw new Error('Missing data')
        }
        data.name = m.content
        this.setChildren([askAge])
        return data
      }
      const askName = new MyPhase<PhaseData>(thisPhaseForm, askNameFn)

      const channel = createMockChannel()
      const name = 'George'
      const age = '30'
      const runner = new PhaseRunner<PhaseData>()
      const promise = runner.run(askName, channel, {})
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
