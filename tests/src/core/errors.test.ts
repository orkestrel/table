import type { JSONRecord } from '@orkestrel/contract'
import { TableError, isTableError } from '@src/core'
import { describe, expect, it } from 'vitest'

describe('TableError', () => {
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
