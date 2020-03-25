import { Phase } from "./Phase";

export class EndPhase<T> extends Phase<T> {
  shouldRunCollector (): boolean {
    return false
  }
}
