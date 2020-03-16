import { Rejection } from './errors/Rejection'

export * from './Phase'
export * from './PhaseRunner'
import * as phaseTypes from './types/phase'
import * as discordTypes from './types/discord'

export const types = {
  ...phaseTypes,
  ...discordTypes
}

export const PhaseErrors = {
  Rejection
}
