
# Discord Menus
[![Maintainability](https://api.codeclimate.com/v1/badges/4be50d131276538502d1/maintainability)](https://codeclimate.com/github/synzen/discord-menus/maintainability)
<a href="https://codeclimate.com/github/synzen/discord-menus/test_coverage"><img src="https://api.codeclimate.com/v1/badges/4be50d131276538502d1/test_coverage" /></a>


A work-in-progress framework for Discord JS libraries for building a series of interactable prompts (or menus) in a chat-like fashio with an N-ary tree structure. Each phase is a tree node with a user-specified `n` number of children with optional conditions to decide which branch the dialogue should continue through to.

## Example
```ts
type AgePhaseData = {
  name: string;
  age: number;
}

// Ask name phase that collects messages
const askNameFn: PhaseFunction<AgePhaseData> = async function (m, data) {
  data.name = m.content
  return data
}
const askName = new Phase<AgePhaseData>(() => ({
  text: `What's your name?`,
  embed: {
    title: 'Tell me your name'
  }
}), askNameFn)

// Ask age phase that collects messages
const askAgeFn: PhaseFunction<AgePhaseData> = async function (m, data) {
  if (isNaN(Number(m.content))) {
    throw new PhaseErrors.Rejection()
  }
  data.age = Number(m.content)
  return data
}
const askAge = new Phase<AgePhaseData>((m, data) => ({
  text: `How old are you, ${data.name}?`
}), askAgeFn)

// Conditional phase with no collector
const tooOld = new Phase<AgePhaseData>((m, data) => ({
  text: `Wow ${data.name}, you are pretty old at ${data.age} years old!`
}), undefined, async (m, data) => data.age > 20)

// Conditional phase with no collector
const tooYoung = new Phase<AgePhaseData>((m, data) => ({
  text: `Wow ${data.name}, you are pretty young at ${data.age} years old!`
}), undefined, async (m, data) => data.age <= 20)

askName.setChildren([askAge])
// Nodes with more than 1 sibling must have conditions defined
askAge.setChildren([tooOld, tooYoung])

// Message and messageCollectorCreator must be implemented by user
PhaseRunner.run(askName, message, messageCollectorCreator)

```
### Example Image
![Chat image of example](https://i.imgur.com/rb1CauC.png)

## Implementation

The `MessageInterface` and `ChannelInterface` must be implemented, where the MessageInterface is passed to `PhaseRunner`.
```ts
interface ChannelInterface {
  send: (text: string, embed?: object) => Promise<MessageInterface>;
}

interface MessageInterface {
  channel: ChannelInterface;
  content: string;
  author: {
    id: string;
  };
}
```
The `PhaseCollectorCreator` must be implemented as a function that returns `PhaseCollectorInterface`. The `PhaseCollectorCreator` is then passed to `PhaseRunner`.
```ts
type PhaseCollectorCreator<T> = (
  message: MessageInterface,
  func: PhaseFunction<T>,
  data?: T,
  duration?: number
) => PhaseCollectorInterface<T>

// The collector has 5 events to emit: 'reject', 'accept', 'exit', 'inactivity', 'exit'
interface PhaseCollectorInterface extends EventEmitter {
  emit(event: 'reject', message: MessageInterface, error: Rejection): boolean;
  emit(event: 'accept', message: MessageInterface, data: T): boolean;
  emit(event: 'exit', message: MessageInterface): boolean;
  emit(event: 'inactivity'): boolean;
  emit(event: 'error', message: MessageInterface, error: Error): boolean;

  on(event: 'reject', listener: (message: MessageInterface, error: Rejection) => void): this;
  once(event: 'accept', listener: (message: MessageInterface, data: T) => void): this;
  once(event: 'exit', listener: (message: MessageInterface) => void): this;
  once(event: 'inactivity', listener: () => void): this;
  once(event: 'error', listener: (message: MessageInterface, error: Error) => void): this;
}
```

## Testing

Unit testing is straightforward since the tree of responses is built up from individual phases (or nodes) represented by functions that can be exported for testing.

Integration testing can be asserted on the execution order of the phases.
```ts
async function flushPromises(): Promise<void> {
  return new Promise(setImmediate);
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

it('runs correctly for age <= 20', () => {
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
```
