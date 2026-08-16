import type { JSONRecord } from '@orkestrel/contract'
import type { TableErrorCode } from './types.js'

/** An error raised by the table domain. */
export class TableError extends Error {
	/** The machine-readable reason for this failure. */
	readonly code: TableErrorCode

	/** Structured values that locate or explain this failure. */
	readonly context?: JSONRecord

	/**
	 * Create a table error.
	 *
	 * @param code - The machine-readable reason.
	 * @param message - The human-readable failure text.
	 * @param context - Optional structured failure details.
	 */
	constructor(code: TableErrorCode, message: string, context?: JSONRecord) {
		super(message)
		this.name = 'TableError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Determine whether an unknown value is a table error.
 *
 * @param input - The value to inspect.
 * @returns Whether the value is a {@link TableError} instance.
 */
export function isTableError(input: unknown): input is TableError {
	return input instanceof TableError
}
