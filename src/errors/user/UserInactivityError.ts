import { UserError } from "./UserError";

export class UserInactivityError extends UserError {
  constructor(message = 'User reached timeout for inactivity') {
    super(message)
  }
}
