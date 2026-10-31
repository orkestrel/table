import type { JSONRecord } from '@orkestrel/contract'
import type { GridErrorCode } from './types.js'
import { holds, INTRINSICS, isRecord, GUARD_DEPTH_LIMIT } from '@orkestrel/contract'

/**
 * Represents an error raised by the grid domain — a machine-readable `code` and optional
 * structured `context`.
 */
export class GridError extends Error {
	/** Holds the machine-readable reason for this failure. */
	readonly code: GridErrorCode

	/** Holds structured values that locate or explain this failure. */
	readonly context?: JSONRecord

	/**
	 * Creates a grid error.
	 *
	 * @param code - The machine-readable reason.
	 * @param message - The human-readable failure text.
	 * @param context - Optional structured failure details.
	 */
	constructor(code: GridErrorCode, message: string, context?: JSONRecord) {
		super(message)
		INTRINSICS.define(this, Symbol.for('@orkestrel/table.GridError'), { value: this })
		this.name = 'GridError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Determines whether a caught value is a grid error, so a `catch` branches on `code` without an
 * assertion.
 *
 * @remarks
 * Recognizes self-branded errors across copies and subclasses and refuses transparent proxies.
 * Validates the declared code and optional JSON context.
 *
 * @param input - The value to inspect.
 * @returns True if the value is a {@link GridError} instance; false otherwise.
 */
export function isGridError(input: unknown): input is GridError {
	return holds(() => {
		if (!(input instanceof Error) || INTRINSICS.prototype(input) === Error.prototype) return false
		const brand = INTRINSICS.describe(input, Symbol.for('@orkestrel/table.GridError'))
		if (brand?.value !== input) return false
		const code: unknown = INTRINSICS.reflect.read(input, 'code')
		const context: unknown = INTRINSICS.reflect.read(input, 'context')
		if (
			code !== 'SCHEMA' &&
			code !== 'COLUMN' &&
			code !== 'KEY' &&
			code !== 'CELL' &&
			code !== 'DESTROYED'
		)
			return false
		if (context === undefined) return true
		if (!isRecord(context)) return false
		const pending: Array<{ readonly value: unknown; readonly ancestors: readonly object[] }> = [
			{ value: context, ancestors: [] },
		]
		for (const { value, ancestors } of pending) {
			if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) continue
			if (!Array.isArray(value) && !isRecord(value)) return false
			if (ancestors.length >= GUARD_DEPTH_LIMIT || ancestors.includes(value)) return false
			const path = [...ancestors, value]
			const children = Array.isArray(value)
				? Array.from({ length: value.length }, (_, index): unknown => value[index])
				: Object.values(value)
			for (const child of children) pending.push({ value: child, ancestors: path })
		}
		return true
	})
}
