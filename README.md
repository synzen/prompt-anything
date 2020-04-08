
# Prompt Anything
[![Maintainability](https://api.codeclimate.com/v1/badges/4be50d131276538502d1/maintainability)](https://codeclimate.com/github/synzen/discord-menus/maintainability)
<a href="https://codeclimate.com/github/synzen/discord-menus/test_coverage"><img src="https://api.codeclimate.com/v1/badges/4be50d131276538502d1/test_coverage" /></a>

A modular, testable framework to build prompts of any kind (including console prompts).

## Implementation

The following interfaces should be implemented:
```ts
type FormatInterface = {
  text: string;
}

interface ChannelInterface {
  send: (format: Format) => Promise<MessageInterface>;
}

interface MessageInterface {
  content: string;
}

```
The `Prompt` method must be extended to implement the abstract method `createCollector` that returns an event emitter that emits whenever your collector gets a message. Your collector should also stop when the emitter emits stop.
```ts
class MyPrompt<T> extends Prompt<T> {
  createCollector(channel: ChannelInterface, data: T): PromptCollector<T> {
    const emitter = new EventEmitter()
    // REQUIRED
    // Collect your messages via your listeners, and return an emitter that follows these rules
    myCollector.on('message', (message: MessageInterface) => {
      // Emit the messages from your collector here
      emitter.emit('message', message)
    })
    // REQUIRED
    emitter.once('stop', () => {
      // Stop your collector here
      myCollector.stop()
    })
    // Optional
    emitter.on('reject', (message: ConsoleMessage, error: Rejection) => {
      this.sendMessage('My rejection message', channel)
        .catch(err => emitter.emit('error', err))
    })
    // Optional. Not needed if there is no timeout.
    emitter.once('inactivity', () => {
      this.sendMessage('You took too long to answer!', channel)
        .catch(err => emitter.emit('error', err))
    })
    return emitter
  }
}
```
### Example

See the `examples/console.ts` for an implementation that accepts input from the console.

## Testing

Unit testing is straightforward since the tree of responses is built up from individual, isolated prompts represented by functions that can be exported for testing.

Integration testing can be asserted on the execution order of the phases. A "flush promises" method must be used.
```ts
async function flushPromises(): Promise<void> {
  return new Promise(setImmediate);
}

type MockMessage = {
  content: string;
}

const createMockMessage = (content = ''): MockMessage => ({
  content
})

it('runs correctly for age <= 20', () => {
  type AgeData = {
    name?: string;
    age?: number;
  }
  // Set up spies and the global emitter we'll use
  const emitter: PromptCollector<AgeData> = new EventEmitter()
  const spy = jest.spyOn(MyPrompt.prototype, 'createCollector')
    .mockReturnValue(emitter)

  // Ask name Prompt that collects messages
  const askNameFn: PromptFunction<AgeData> = async function (m, data) {
    data.name = m.content
    return data
  }
  const askName = new ConsolePrompt(() => ({
    text: `What's your name?`
  }), askNameFn)

  // Ask age Prompt that collects messages
  const askAgeFn: PromptFunction<AgeData> = async function (m, data) {
    if (isNaN(Number(m.content))) {
      throw new Errors.Rejection()
    }
    data.age = Number(m.content)
    return data
  }
  const askAge = new MyPrompt((data) => ({
    text: `How old are you, ${data.name}?`
  }), askAgeFn)

  // Conditional Prompt with no collector (MyPrompt)
  const tooOld = new MyPrompt<AgeData>((data) => ({
    text: `Wow ${data.name}, you are pretty old at ${data.age} years old!`
  }), undefined, async (data) => !!data.age && data.age > 20)

  // Conditional Prompt with no collector (MyPrompt)
  const tooYoung = new MyPrompt<AgeData>((data) => ({
    text: `Wow ${data.name}, you are pretty young at ${data.age} years old!`
  }), undefined, async (data) => !!data.age && data.age <= 20)

  askName.setChildren([askAge])
  // Nodes with more than 1 sibling must have conditions defined
  askAge.setChildren([tooOld, tooYoung])

  const message = createMockMessage()
  const name = 'George'
  const age = '30'
  const runner = new PromptRunner<AgeData>()
  const promise = runner.run(askName, message)
  // Wait for all pending promise callbacks to be executed for the emitter to set up
  await flushPromises()
  // Accept the name
  emitter.emit('message', createMockMessage(name))
  // Assert askName ran first
  expect(runner.indexOf(askName)).toEqual(0)
  // Wait for all pending promise callbacks to be executed for message to be accepted
  await flushPromises()
  // Accept the age
  emitter.emit('message', createMockMessage(age))
  // Assert askAge ran second
  expect(runner.indexOf(askAge)).toEqual(1)
  await promise
  // Assert tooOld ran third, and tooYoung never ran
  expect(runner.indexesOf([tooOld, tooYoung]))
    .toEqual([2, -1])

  // Clean up
  spy.mockRestore()
})
```
