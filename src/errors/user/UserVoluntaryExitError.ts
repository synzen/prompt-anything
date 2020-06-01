import { UserError } from "./UserError";

export class UserVoluntaryExitError extends UserError {
  constructor (message = 'User voluntarily exited prompt') {
    super(message)
  }
}
