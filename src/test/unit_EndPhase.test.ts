import { EndPhase } from '../EndPhase'

describe('Unit::EndPhase', () => {
  const phaseVis = (): { text: string } => ({
    text: 'foobar'
  })
  const phaseFunc = async (): Promise<{}> => ({})
  describe('shouldRunCollector', () => {
    it('returns false', () => {
      const phase = new EndPhase(phaseVis, phaseFunc)
      expect(phase.shouldRunCollector()).toEqual(false)  
    })
  })
})
