import { Phase } from "./Phase";
import { EventEmitter } from "events";

export class EndPhase<T> extends Phase<T> {
  createCollector = (): EventEmitter => {
    return this.createCollector()
  };

  shouldRunCollector (): boolean {
    return false
  }
}
