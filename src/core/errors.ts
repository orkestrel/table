import type { JSONRecord } from '@orkestrel/contract'
import type { TableErrorCode } from './types.js'
import { holds, INTRINSICS, isJSONValue, isRecord } from '@orkestrel/contract'

/**
 * Represents an error raised by the table domain — a machine-readable `code` and optional
 * structured `context`.
 */
export class TableError extends Error {
	/** Holds the machine-readable reason for this failure. */
	readonly code: TableErrorCode

	/** Holds structured values that locate or explain this failure. */
	readonly context?: JSONRecord

	/**
	 * Creates a table error.
	 *
	 * @param code - The machine-readable reason.
	 * @param message - The human-readable failure text.
	 * @param context - Optional structured failure details.
	 */
	constructor(code: TableErrorCode, message: string, context?: JSONRecord) {
		super(message)
		INTRINSICS.define(this, Symbol.for('@orkestrel/table.TableError'), { value: this })
		this.name = 'TableError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Determines whether a caught value is a table error, so a `catch` branches on `code` without an
 * assertion.
 *
 * @remarks
 * Recognizes self-branded errors across copies and subclasses and refuses transparent proxies.
 * Validates the declared code and optional JSON context.
 *
 * @param input - The value to inspect.
 * @returns True if the value is a {@link TableError} instance; false otherwise.
 */
export function isTableError(input: unknown): input is TableError {
	return holds(() => {
		if (!(input instanceof Error) || INTRINSICS.prototype(input) === Error.prototype) return false
		const brand = INTRINSICS.describe(input, Symbol.for('@orkestrel/table.TableError'))
		if (brand?.value !== input) return false
		const code: unknown = INTRINSICS.reflect.read(input, 'code')
		const context: unknown = INTRINSICS.reflect.read(input, 'context')
		return (
			(code === 'SCHEMA' ||
				code === 'COLUMN' ||
				code === 'KEY' ||
				code === 'CELL' ||
				code === 'DESTROYED') &&
			(context === undefined || (isRecord(context) && isJSONValue(context)))
		)
	})
}
