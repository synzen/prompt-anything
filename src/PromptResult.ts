export class PromptResult<DataType> {
  data: DataType
  terminate: boolean
  
  constructor (data: DataType, terminate = false) {
    this.data = data
    this.terminate = terminate
  }
}
