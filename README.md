
# Prompt Anything
[![Maintainability](https://api.codeclimate.com/v1/badges/4be50d131276538502d1/maintainability)](https://codeclimate.com/github/synzen/discord-menus/maintainability)
<a href="https://codeclimate.com/github/synzen/discord-menus/test_coverage"><img src="https://api.codeclimate.com/v1/badges/4be50d131276538502d1/test_coverage" /></a>

A modular and customizable framework to build prompts of any kind (such as ones within the console)! Originally inspired by the need to create console-like prompts in other applications such as chatting with bots.

### Table of Contents
- [Implementation](#implementation)
- [Usage](#usage)
  - [Creating a Prompt](#creating-a-prompt)
    - [Conditional Prompts](#conditional-prompts)
    - [Conditional Visuals](#conditional-visuals)
    - [Skipping Message Collection](#skipping-message-collection)
  - [Connecting Prompts](#connecting-prompts)
  - [Running Prompts](#running-prompts)

## Implementation

The following interfaces should be implemented:
```ts
type VisualInterface = {
  text: string;
}

interface MessageInterface {
  content: string;
}

interface ChannelInterface {
  send: (visual: VisualInterface) => Promise<MessageInterface>;
}
```
The `Prompt` method must be extended to implement the abstract methods `createCollector`, `onReject`, `onInactivity` and `onExit`. `createCollector` should returns an event emitter that should also emit `message` whenever your collector gets a message. Your collector should stop when the emitter emits `stop`.
```ts
class MyPrompt<DataType> extends Prompt<DataType> {
  createCollector(channel: ChannelInterface, data: DataType): PromptCollector<DataType> {
    const emitter = new EventEmitter()
    // Collect your messages via your listeners, and return an emitter that follows these rules
    myCollector.on('myMessage', (message: MessageInterface) => {
      // Emit the messages from your collector here
      emitter.emit('message', message)
    })
    emitter.once('stop', () => {
      // Stop your collector here
      myCollector.stop()
    })
    return emitter
  }
  
  // Implement abstract methods. These events are automatically called
  abstract async onReject(message: MessageInterface, error: Rejection, channel: ChannelInterface): Promise<void>;
  abstract async onInactivity(channel: ChannelInterface): Promise<void>;
  abstract async onExit(message: MessageInterface, channel: ChannelInterface): Promise<void>;
}
```

## Usage

See the `examples/console.ts` for a functioning implementation that accepts input from the console.

### Creating a Prompt
```ts
// Data type that is passed to each prompt
type MyData = {
  human?: boolean;
  name?: string;
  age?: number;
}

// askNameFn is run on every message collected during this prompt. This should be a pure function. (see below for details)
const askNameFn: PromptFunction<MyData> = async (m: MessageInterface, data: MyData) => {
  // This data is returned to the next prompt
  return {
    ...data,
    name: m.content
  }
}
const askNamePrompt = new MyPrompt<MyData>({
  text: 'What is your name?'
}, askNameFn)
```
The `PromptFunction` should be [pure function](https://en.wikipedia.org/wiki/Pure_function) to 

1. Minimize side effects that can affect every other function that depends on the data. 
2. Simplify unit-testing

As a result, the function should always be referencing the original data variable passed from the previous prompt, regardless of how many times the function is run.

#### Conditional Prompts

If you only want a prompt to run if it matches a condition, you can specify a condition function as the third argument of a `Prompt`.

```ts
const askNameCondition = (data: MyData) => {
  // Don't run askName if data.human is true
  if (data.human) {
    return false
  } else {
    return true
  }
}
const askNamePrompt = new MyPrompt<MyData>({
  text: 'What is your name?'
}, askNameFn, askNameCondition)
```

#### Conditional Visuals

If you want a prompt's visual to be dependent on the given data, you can pass a function as the argument of a `Prompt` instead of an object.

```ts
const askNamePrompt = new MyPrompt<MyData>((data: MyData): VisualInterface => ({
  text: `Hello ${data.human ? 'non-human' : 'human'}! What is your name?`
}), askNameFn)
```

#### Rejecting Input

To reject input, you can check the the content of the message in `PromptFunction`, and throw a `Rejection`. Upon throwing it:

1. The rejection's message will be sent via your channel implementation's `send` method
2. The prompt will again wait for input
3. Run the prompt function again

```ts
const askAgeFn: PromptFunction<MyData> = async (m: MessageInterface, data: MyData) => {
  const age = Number(m.content)
  if (isNaN(age)) {
    throw new Rejection(`That's not a valid number! Try again.`)
  }
  return {
    ...data,
    age
  }
}
```

#### Skipping Message Collection

To skip message collecting and only send a message (usually done at the end of prompts), simply leave the second argument of `Prompt` as `undefined`.

```ts
const askNamePrompt = new MyPrompt<MyData>({
  text: 'The end is nigh'
})
```

### Connecting Prompts

To connect prompts, you must put them into nodes and connect nodes together by setting their children. This allows prompts to be reused by attaching children to nodes instead of prompts.

```ts
const askNameNode = new PromptNode<MyData>(askNamePrompt)
const askAgeNode = new PromptNode<MyData>(askAgePrompt)
const askLocationNode = new PromptNode<MyData>(askLocationPrompt)
// After we ask for the location, we'd like to send a prompt in a different language based on their input
const englishAskNode = new PromptNode<MyData>(englishAskPrompt)
const spanishAskNode = new PromptNode<MyData>(spanishAskPrompt)

askNameNode.addChild(askAgeNode)
askAgeNode.addChild(askLocationNode)
// addChild can be daisy-chained
askLocationNode
  .addChild(englishAskNode)
  .addChild(spanishAskNode)
// setChildren also works
askLocationNode.setChildren([englishAskNode, spanishAskNode])
```

The order of the children matters. The first child that matches its condition based on the given data will run. In this example, if `englishAskPrompt`'s condition function returns `true`, then `spanishAskNode` will never run.

### Running Prompts

After your prompt nodes are created, pass the root node into a `PromptRunner`.

```ts
const runner = new PromptRunner<MyData>({})

// run resolves with the data returned from the last prompt
const channel: ChannelInterface = myImplementedChannel()
const lastPromptData: MyData = await runner.run(askNameNode, channel)
// askName -> askAge -> askLocation -> (englishAsk OR spanishAsk)
// lastPromptData is the data returned from either englishAsk or spanishAsk
```

## Testing

Unit testing is straightforward since the tree of responses is built up from individual, isolated prompts represented by functions that can be exported for testing.

If the data is an object, prompt functions should be pure since each prompt should ideally depend on the exact object given by the previous prompt (unmodified by the current one).

Integration testing can be asserted on the execution order of the phases. Unfortunately, a "flush promises" method must be used since we cannot normally `await` the promises while we are waiting for messages from `EventEmitter`, otherwise the promise would never resolve until the series of prompts has ended.
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
    return {
      ...data,
      name: m.content
    }
  }
  const askName = new ConsolePrompt(() => ({
    text: `What's your name?`
  }), askNameFn)

  // Ask age Prompt that collects messages
  const askAgeFn: PromptFunction<AgeData> = async function (m, data) {
    if (isNaN(Number(m.content))) {
      throw new Errors.Rejection()
    }
    return {
      ...data,
      age: Number(m.content)
    }
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

  const askNameNode = new PromptNode(askName)
  const askAgeNode = new PromptNode(askAge)
  const tooYoungNode = new PromptNode(tooYoung)
  const tooOldNode = new PromptNode(tooOld)
  askNameNode.setChildren([askAgeNode])
  // Nodes with more than 1 sibling must have conditions defined
  askAgeNode.setChildren([tooOldNode, tooYoungNode])

  const message = createMockMessage()
  const name = 'George'
  const age = '30'
  const runner = new PromptRunner<AgeData>()
  const promise = runner.run(askNameNode, message)
  // Wait for all pending promise callbacks to be executed for the emitter to set up
  await flushPromises()
  // Accept the name
  emitter.emit('message', createMockMessage(name))
  await flushPromises()
  // Assert askName ran first
  expect(runner.indexOf(askName)).toEqual(0)
  await flushPromises()
  // Accept the age
  emitter.emit('message', createMockMessage(age))
  await flushPromises()
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
