import { Prompt, PromptFunction, PromptRunner, MessageInterface, PromptCollector, ChannelInterface, FormatInterface, Rejection } from '../src/index'
import { EventEmitter } from 'events'
import { createInterface } from 'readline'

/**
 * Implement relevant interfaces for console use
 */

class ConsoleFormat implements FormatInterface {
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

class ConsoleChannel implements ChannelInterface {
  async send (format: ConsoleFormat): Promise<ConsoleMessage> {
    if (!format.newline) {
      process.stdout.write(format.text + ' ')
    } else {
      console.log(format.text)
    }
    return new ConsoleMessage(format.text)
  }
}

class ConsolePrompt<T> extends Prompt<T> {
  static exitFormat: ConsoleFormat = {
    text: `No longer accepting input.`,
    newline: true
  }
  static inactivityFormat: ConsoleFormat = {
    text: `You took too long.`,
    newline: true
  }
  static getRejectFormat (error: Rejection): ConsoleFormat {
    return {
      text: `That's invalid input! (${error.message})`,
      newline: true
    }
  }

  createCollector(channel: ChannelInterface, data: T): PromptCollector<T> {
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
    // Optional
    emitter.on('reject', (message: ConsoleMessage, error: Rejection) => {
      this.sendMessage(ConsolePrompt.getRejectFormat(error), channel)
        .catch(err => emitter.emit('error', err))
    })
    // Optional
    emitter.once('inactivity', () => {
      this.sendMessage(ConsolePrompt.inactivityFormat, channel)
        .catch(err => emitter.emit('error', err))
    })
    // Optional
    emitter.once('exit', (message: ConsoleMessage) => {
      this.sendMessage(ConsolePrompt.exitFormat, channel)
        .catch(err => emitter.emit('error', err))
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
const askNameFn: PromptFunction<AgePromptData> = async function (m, data) {
  data.name = m.content
  return data
}
const askName = new ConsolePrompt((): ConsoleFormat => ({
  text: `What's your name?`,
  newline: false
}), askNameFn)

// Ask age Prompt that collects messages
const askAgeFn: PromptFunction<AgePromptData> = async function (m, data) {
  if (isNaN(Number(m.content))) {
    throw new Rejection(`That's not a number!`)
  }
  data.age = Number(m.content)
  return data
}
const askAge = new ConsolePrompt((data): ConsoleFormat => ({
  text: `How old are you, ${data.name}?`,
  newline: true
}), askAgeFn)

// Conditional Prompt with no collector (ConsolePrompt)
const tooOld = new ConsolePrompt<AgePromptData>((data) => ({
  text: `Wow ${data.name}, you are pretty old at ${data.age} years old!`
}), undefined, async (data) => !!data.age && data.age > 20)

// Conditional Prompt with no collector (ConsolePrompt)
const tooYoung = new ConsolePrompt<AgePromptData>((data) => ({
  text: `Wow ${data.name}, you are pretty young at ${data.age} years old!`
}), undefined, async (data) => !!data.age && data.age <= 20)

askName.setChildren([askAge])
// Nodes with more than 1 sibling must have conditions defined
askAge.setChildren([tooOld, tooYoung])

// Message and messageCollectorCreator must be implemented by user
const runner = new PromptRunner({})
const channel = new ConsoleChannel()
runner.run(askName, channel)
  .catch(err => {
    // From the error listener of a prompt
    console.error(err)
  })
