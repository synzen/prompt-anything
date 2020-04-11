export class PromptResult<T> {
  data: T
  terminate: boolean
  
  constructor (data: T, terminate = false) {
    this.data = data
    this.terminate = terminate
  }
}
