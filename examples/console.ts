import { Prompt, PromptFunction, PromptRunner, MessageInterface, PromptCollector, ChannelInterface, VisualInterface, Rejection, PromptNode } from '../src/index'
import { EventEmitter } from 'events'
import { createInterface } from 'readline'

/**
 * Implement relevant interfaces for console use
 */

class ConsoleVisual implements VisualInterface {
  text: string
  newline?: boolean

  constructor (text: string, newline?: boolean) {
    this.text = text
    this.newline = newline
  }
}

class ConsoleMessage implements MessageInterface {
  content: string
  constructor (message: string) {
    this.content = message
  }
}

class ConsoleChannel implements ChannelInterface<ConsoleMessage> {
  async send (visual: ConsoleVisual): Promise<ConsoleMessage> {
    if (!visual.newline) {
      process.stdout.write(visual.text + ' ')
    } else {
      console.log(visual.text)
    }
    return new ConsoleMessage(visual.text)
  }
}

class ConsolePrompt<T> extends Prompt<T, ConsoleMessage> {
  static exitVisual: ConsoleVisual = {
    text: `No longer accepting input.`,
    newline: true
  }
  static inactivityVisual: ConsoleVisual = {
    text: `You took too long.`,
    newline: true
  }
  static getRejectVisual (error: Rejection): ConsoleVisual {
    return {
      text: `That's invalid input! (${error.message})`,
      newline: true
    }
  }

  // Implement abstract methods. These events are automatically called
  // and should NOT be called manually. These evnts should be emitted
  async onReject(message: MessageInterface, error: Rejection, channel: ChannelInterface<ConsoleMessage>): Promise<void> {
    await this.sendVisual(ConsolePrompt.getRejectVisual(error), channel)
  }
  async onInactivity(channel: ChannelInterface<ConsoleMessage>): Promise<void> {
    await this.sendVisual(ConsolePrompt.inactivityVisual, channel)
  }
  async onExit(message: MessageInterface, channel: ChannelInterface<ConsoleMessage>): Promise<void> {
    await this.sendVisual(ConsolePrompt.exitVisual, channel)
  }

  createCollector(channel: ChannelInterface<ConsoleMessage>, data: T): PromptCollector<T> {
    const emitter: PromptCollector<T> = new EventEmitter()
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout
    })
    readline.on('line', (line: string) => {
      const message = new ConsoleMessage(line)
      if (line === 'exit') {
        // Exits are optional
        emitter.emit('exit', message)
      } else {
        // REQUIRED
        // but emitting messages are required
        emitter.emit('message', message)
      }
    })
    // REQUIRED
    emitter.once('stop', () => {
      readline.close()
    })
    return emitter
  }
}

/**
 * Now create the actual prompts
 */

type AgePromptData = {
  name?: string;
  age?: number;
}

// Ask name Prompt that collects messages
const askNameFn: PromptFunction<AgePromptData, ConsoleMessage> = async function (m, data) {
  return {
    ...data,
    name: m.content
  }
}
const askName = new ConsolePrompt({
  text: `What's your name?`,
  newline: false
} as ConsoleVisual, askNameFn)

// Ask age Prompt that collects messages
const askAgeFn: PromptFunction<AgePromptData, ConsoleMessage> = async function (m, data) {
  if (isNaN(Number(m.content))) {
    throw new Rejection(`That's not a number!`)
  }
  return {
    ...data,
    age: Number(m.content)
  }
}
const askAge = new ConsolePrompt(async (data) => ({
  text: `How old are you, ${data.name}?`,
  newline: true
}) as ConsoleVisual, askAgeFn)

// Conditional Prompt with no collector via undefined function
const tooOld = new ConsolePrompt<AgePromptData>(async (data) => ({
  text: `Welcome ${data.name}, at ${data.age} you can freely drink.`
}))

// Conditional Prompt with no collector via undefined function
const tooYoung = new ConsolePrompt<AgePromptData>(async (data) => ({
  text: `Woah ${data.name}, at ${data.age} you can't drink yet.`
}))

// Create the nodes. Prompts can be used by different nodes
const askNameNode = new PromptNode(askName)
const askAgeNode = new PromptNode(askAge)
const tooOldNode = new PromptNode(tooOld, async (data: AgePromptData) => !!data.age && data.age > 21)
const tooYoungNode = new PromptNode(tooYoung, async (data: AgePromptData) => !!data.age && data.age <= 21)
askNameNode.setChildren([askAgeNode])
// Nodes with more than 1 sibling must have conditions defined
askAgeNode.setChildren([tooOldNode, tooYoungNode])

// Message and messageCollectorCreator must be implemented by user
const runner = new PromptRunner({})
const channel = new ConsoleChannel()
runner.run(askNameNode, channel)
  .catch(err => {
    // From the error listener of a prompt
    console.error(err)
  })
