import { Rejection } from "../errors/Rejection"

describe('Unit::Rejection', () => {
  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })
  it('calls capture stack trace if it exists', () => {
    const captureStackTrace = jest.spyOn(Error, 'captureStackTrace')
    const err = new Rejection('a')
    expect(captureStackTrace).toHaveBeenCalledWith(err, Rejection)
  })
  it('does not call capture stack trace if it does not exist', () => {
    const original = Error.captureStackTrace
    const captureStackTrace = jest.spyOn(Error, 'captureStackTrace')
    Object.defineProperty(Error, 'captureStackTrace', {
      value: null
    })
    new Rejection('a')
    expect(captureStackTrace).not.toHaveBeenCalled()
    Object.defineProperty(Error, 'captureStackTrace', {
      value: original
    })
  })
})
