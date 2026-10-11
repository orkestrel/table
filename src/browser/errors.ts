import type { TableBindingErrorCode } from './types.js'
import { isInstance } from '@orkestrel/contract'

/** Represents a native table binding failure with a machine-readable code. */
export class TableBindingError extends Error {
	readonly code: TableBindingErrorCode

	/** Creates a binding failure.
	 * @param code - The failed boundary.
	 * @param message - The explanation.
	 */
	constructor(code: TableBindingErrorCode, message: string) {
		super(message)
		this.name = 'TableBindingError'
		this.code = code
	}
}

/** Checks whether a caught value is a native table binding error.
 * @param value - The caught value.
 * @returns Whether the value is a binding error.
 */
export function isTableBindingError(value: unknown): value is TableBindingError {
	return isInstance(value, TableBindingError)
}
