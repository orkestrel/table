import type { JSONRecord } from '@orkestrel/contract'
import { GridError, isGridError } from '@src/core'
import { describe, expect, it } from 'vitest'

describe('GridError', () => {
	it('accepts a NaN context admitted by JSONRecord', () => {
		// Base: f66eae0^:src/core/errors.ts:40.
		expect(isGridError(new GridError('COLUMN', 'failure', { measurement: Number.NaN }))).toBe(true)
	})

	it('accepts infinite context values admitted by JSONRecord', () => {
		// Base: f66eae0^:src/core/errors.ts:40.
		expect(
			isGridError(new GridError('COLUMN', 'failure', { measurements: [Infinity, -Infinity] })),
		).toBe(true)
	})

	it('refuses cyclic deep unreadable and non-record contexts', () => {
		const cycle: Record<string, unknown> = {}
		cycle.self = cycle
		const deep = Array.from({ length: 513 }).reduce<unknown>((value) => ({ value }), null)
		for (const context of [cycle, deep, new Date(), { value: undefined }]) {
			const error = new GridError('COLUMN', 'failure')
			Object.defineProperty(error, 'context', { value: context })
			expect(isGridError(error)).toBe(false)
		}
		const error = new GridError('COLUMN', 'failure')
		Object.defineProperty(error, 'context', {
			get() {
				throw new Error('unreadable')
			},
		})
		expect(isGridError(error)).toBe(false)
	})

	it('retains its code, message, context, and stable name', () => {
		const context: JSONRecord = { column: 'missing' }
		const error = new GridError('COLUMN', 'The column does not exist', context)

		expect(error).toBeInstanceOf(Error)
		expect(error.name).toBe('GridError')
		expect(error.message).toBe('The column does not exist')
		expect(error.code).toBe('COLUMN')
		expect(error.context).toStrictEqual({ column: 'missing' })
		expect(isGridError(error)).toBe(true)
	})

	it('leaves context absent when none is supplied', () => {
		expect(new GridError('SCHEMA', 'Invalid schema').context).toBeUndefined()
	})

	it('rejects structural imitations and unrelated thrown values', () => {
		expect(isGridError(new Error('plain'))).toBe(false)
		expect(isGridError(null)).toBe(false)
		expect(isGridError({ name: 'GridError', code: 'COLUMN' })).toBe(false)
	})
})
