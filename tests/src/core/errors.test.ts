import type { JSONRecord } from '@orkestrel/contract'
import { TableError, isTableError } from '@src/core'
import { describe, expect, it } from 'vitest'

describe('TableError', () => {
	it('accepts a NaN context admitted by JSONRecord', () => {
		// Base: f66eae0^:src/core/errors.ts:40.
		expect(isTableError(new TableError('COLUMN', 'failure', { measurement: Number.NaN }))).toBe(
			true,
		)
	})

	it('accepts infinite context values admitted by JSONRecord', () => {
		// Base: f66eae0^:src/core/errors.ts:40.
		expect(
			isTableError(new TableError('COLUMN', 'failure', { measurements: [Infinity, -Infinity] })),
		).toBe(true)
	})

	it('refuses cyclic deep unreadable and non-record contexts', () => {
		const cycle: Record<string, unknown> = {}
		cycle.self = cycle
		const deep = Array.from({ length: 513 }).reduce<unknown>((value) => ({ value }), null)
		for (const context of [cycle, deep, new Date(), { value: undefined }]) {
			const error = new TableError('COLUMN', 'failure')
			Object.defineProperty(error, 'context', { value: context })
			expect(isTableError(error)).toBe(false)
		}
		const error = new TableError('COLUMN', 'failure')
		Object.defineProperty(error, 'context', {
			get() {
				throw new Error('unreadable')
			},
		})
		expect(isTableError(error)).toBe(false)
	})

	it('retains its code, message, context, and stable name', () => {
		const context: JSONRecord = { column: 'missing' }
		const error = new TableError('COLUMN', 'The column does not exist', context)

		expect(error).toBeInstanceOf(Error)
		expect(error.name).toBe('TableError')
		expect(error.message).toBe('The column does not exist')
		expect(error.code).toBe('COLUMN')
		expect(error.context).toStrictEqual({ column: 'missing' })
		expect(isTableError(error)).toBe(true)
	})

	it('leaves context absent when none is supplied', () => {
		expect(new TableError('SCHEMA', 'Invalid schema').context).toBeUndefined()
	})

	it('rejects structural imitations and unrelated thrown values', () => {
		expect(isTableError(new Error('plain'))).toBe(false)
		expect(isTableError(null)).toBe(false)
		expect(isTableError({ name: 'TableError', code: 'COLUMN' })).toBe(false)
	})
})
