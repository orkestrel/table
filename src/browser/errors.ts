import type { TableBindingErrorCode } from './types.js'
import { holds, INTRINSICS } from '@orkestrel/contract'

/** Represents a native table binding failure with a machine-readable code. */
export class TableBindingError extends Error {
	readonly code: TableBindingErrorCode

	/** Creates a binding failure.
	 * @param code - The failed boundary.
	 * @param message - The explanation.
	 */
	constructor(code: TableBindingErrorCode, message: string) {
		super(message)
		INTRINSICS.define(this, Symbol.for('@orkestrel/table.TableBindingError'), { value: this })
		this.name = 'TableBindingError'
		this.code = code
	}
}

/** Checks whether a caught value is a native table binding error.
 * @remarks
 * Recognizes self-branded errors across copies and subclasses and refuses transparent proxies.
 * @param value - The caught value.
 * @returns Whether the value is a binding error.
 */
export function isTableBindingError(value: unknown): value is TableBindingError {
	return holds(() => {
		if (!(value instanceof Error) || INTRINSICS.prototype(value) === Error.prototype) return false
		const brand = INTRINSICS.describe(value, Symbol.for('@orkestrel/table.TableBindingError'))
		return brand?.value === value && INTRINSICS.reflect.read(value, 'code') === 'STRUCTURE'
	})
}
