
# Prompt Anything
[![Maintainability](https://badgen.net/codeclimate/maintainability/synzen/prompt-anything?style=flat)](https://codeclimate.com/github/synzen/prompt-anything/maintainability)
[![Test Coverage](https://badgen.net/codeclimate/coverage/synzen/prompt-anything?style=flat)](https://codeclimate.com/github/synzen/prompt-anything/test_coverage)
![Github license](https://badgen.net/github/license/synzen/prompt-anything?style=flat)

A modular and customizable framework to build prompts of any kind (such as ones within the console)! Originally inspired by the need to create console-like prompts in other applications such as chatting with bots.

### Table of Contents
- [Implementation](#implementation)
- [Usage](#usage)
  - [Creating a Prompt](#creating-a-prompt)
    - [Conditional Visuals](#conditional-visuals)
    - [Rejecting Input](#rejecting-input)
    - [Skipping Message Collection](#skipping-message-collection)
    - [Time Limits](#time-limits)
  - [Connecting Prompts](#connecting-prompts)
    - [Condition Nodes](#conditional-nodes)
  - [Running Prompts](#running-prompts)
- [Testing](#testing)

## Implementation

The following interfaces should be implemented:
```ts
interface VisualInterface = {
  text: string;
}

interface MessageInterface {
  content: string;
}

interface ChannelInterface<MessageType extends MessageInterface> {
  send: (visual: VisualInterface) => Promise<MessageType>;
}
```
The `Prompt` method must be extended to implement the abstract methods `createCollector`, `onReject`, `onInactivity` and `onExit`. `createCollector` should returns an event emitter that should also emit `message` whenever your collector gets a message. Your collector should stop when the emitter emits `stop`.
```ts
class MyPrompt<DataType, MessageType> extends Prompt<DataType, MessageType> {
  createCollector(channel: ChannelInterface<MessageType>, data: DataType): PromptCollector<DataType, MessageType> {
    const emitter: PromptCollector<DataType, MessageType> = new EventEmitter()
    // Collect your messages via your listeners, and return an emitter that follows these rules
    myCollector.on('myMessage', (message: MessageType) => {
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
  abstract async onReject(error: Rejection, message: MessageType, channel: ChannelInterface<MessageType>): Promise<void>;
  abstract async onInactivity(channel: ChannelInterface<MessageType>): Promise<void>;
  abstract async onExit(message: MessageType, channel: ChannelInterface<MessageType>): Promise<void>;
}
```

## Usage

See the `examples/console.ts` for a functioning implementation that accepts input from the console.

### Creating a Prompt
A prompt is composed of two parts:

1. `VisualInterface|VisualGenerator` - A object or function that determines how the prompt looks like to the user
2. `PromptFunction` - An (ideally [pure](https://en.wikipedia.org/wiki/Pure_function)) function that runs on every input from your collector

```ts
// Data type that is passed to each prompt
type MyData = {
  human?: boolean;
  name?: string;
  age?: number;
}

const askNameVisual: VisualInterface = {
  text: 'What is your name?'
}

// askNameFn is run on every message collected during this prompt. This should be a pure function. (see below for details)
const askNameFn: PromptFunction<MyData, MessageType> = async (m: MessageType, data: MyData) => {
  // This data is returned to the next prompt
  return {
    ...data,
    name: m.content
  }
}
// Third argument is the optional PromptCondition
const askNamePrompt = new MyPrompt<MyData, MessageType>(askNameVisual, askNameFn)
```
The `PromptFunction` should be [pure function](https://en.wikipedia.org/wiki/Pure_function) to 

1. Minimize side effects that can affect every other function that depends on the data. 
2. Simplify unit-testing

As a result, the function should always be referencing the original data variable passed from the previous prompt, regardless of how many times the function is run.

#### Conditional Visuals

If you want a prompt's visual to be dependent on the given data, you can pass a function as the argument of a `Prompt` instead of an object.

```ts
const askNamePrompt = new MyPrompt<MyData, MessageType>(async (data: MyData): Promise<VisualInterface> => ({
  text: `Hello ${data.human ? 'non-human' : 'human'}! What is your name?`
}), askNameFn)
```

#### Rejecting Input

To reject input, you can check the the content of the message in `PromptFunction`, and throw a `Rejection`. Upon throwing it:

1. The rejection's message will be sent via your channel implementation's `send` method
2. The prompt will again wait for input
3. Run the prompt function again

```ts
const askAgeFn: PromptFunction<MyData, MessageType> = async (m: MessageType, data: MyData) => {
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

To skip message collecting and only send a prompt's visual (usually done at the end of prompts), simply leave the second argument of `Prompt` as `undefined`.

```ts
const askNamePrompt = new MyPrompt<MyData, MessageType>({
  text: 'The end is nigh'
})
```

#### Time Limits

To automatically end message collection after a set duration, pass your duration in milliseconds as the 4th argument to `Prompt`. Your implemented `onInactivity` method will then be called.

```ts
const duration = 90000
const askNamePrompt = new MyPrompt<MyData, MessageType>(askNameVisual, askNameFn, askNameCondition, duration)
```

### Connecting Prompts

To connect prompts, you must put them into nodes and connect nodes together by setting their children. This allows prompts to be reused by attaching children to nodes instead of prompts.

```ts
const askNameNode = new PromptNode<MyData, MessageType>(askNamePrompt)
const askAgeNode = new PromptNode<MyData, MessageType>(askAgePrompt)
const askLocationNode = new PromptNode<MyData, MessageType>(askLocationPrompt)

askNameNode.addChild(askAgeNode)
askAgeNode.addChild(askLocationNode)
```

#### Conditional Nodes

If you only want a node to run if it matches a condition (given the data from the previous prompt node), you can specify a condition function `PromptNodeCondition` as the second argument of a `PromptNode`.

```ts
// After we ask for the location, we'd like to send a prompt in a different language based on their input
const englishAskNodeCondition: PromptNodeCondition<MyData> = async (data) => !!data.location && data.location === 'loc1'
const englishAskNode = new PromptNode<MyData, MessageType>(englishAskPrompt, englishAskNodeCondition)
const spanishAskNodeCondition: PromptNodeCondition<MyData> = async (data) => !!data.location && data.location === 'loc2'
const spanishAskNode = new PromptNode<MyData, MessageType>(spanishAskPrompt, spanishAskNodeCondition)

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

After your prompt nodes are created, create a `PromptRunner` that is initialized with the data you'll be passing to the first prompt, then call its run method with the first prompt node.

```ts
// The initial data that is given to the first prompt is passed to the PromptRunner's constructor
const runner = new PromptRunner<MyData, MessageType>({})

// run resolves with the data returned from the last prompt
const channel: ChannelInterface = myImplementedChannel()
const lastPromptData: MyData = await runner.run(askNameNode, channel)
// askName -> askAge -> askLocation -> (englishAsk OR spanishAsk)
// lastPromptData is the data returned from either englishAsk or spanishAsk
```

You can also run an array of prompt nodes. The first node that either has no condition, or has a matching condition will be passd to the `run` method.

```ts
const runner = new PromptRunner<MyData>({})

// runArray resolves with the data returned from the last prompt
const channel: ChannelInterface<MessageType> = myImplementedChannel()
const lastPromptData: MyData = await runner.runArray([
  askSurnameNode,
  askNameNode
], channel)
// (askSurname OR askName) -> askAge -> askLocation -> (englishAsk OR spanishAsk)
```

## Testing

Unit testing is straightforward since the tree of responses is built up from individual prompts that can be exported for testing. The prompts can be further decomposed into their visual, functional and conditional parts for even more granular tests.

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
  const emitter: PromptCollector<AgeData, MessageType> = new EventEmitter()
  const spy = jest.spyOn(MyPrompt.prototype, 'createCollector')
    .mockReturnValue(emitter)

  // Ask name Prompt that collects messages
  const askNameFn: PromptFunction<AgeData, MessageType> = async function (m, data) {
    return {
      ...data,
      name: m.content
    }
  }
  const askName = new MyPrompt<AgeData>(() => ({
    text: `What's your name?`
  }), askNameFn)

  // Ask age Prompt that collects messages
  const askAgeFn: PromptFunction<AgeData, MessageType> = async function (m, data) {
    if (isNaN(Number(m.content))) {
      throw new Errors.Rejection()
    }
    return {
      ...data,
      age: Number(m.content)
    }
  }
  const askAge = new MyPrompt<AgeData>((data) => ({
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
