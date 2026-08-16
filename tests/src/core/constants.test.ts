import {
	CHOICE_LIMIT,
	COLUMN_CELLS,
	COLUMN_LIMIT,
	NAME_LIMIT,
	NODE_LIMIT,
	STRING_LIMIT,
	TEXT_LIMIT,
} from '@src/core'
import { describe, expect, it } from 'vitest'

describe('core constants', () => {
	it('lists every column cell in contract order as a frozen registry', () => {
		expect(COLUMN_CELLS).toStrictEqual(['text', 'number', 'flag', 'choice'])
		expect(Object.isFrozen(COLUMN_CELLS)).toBe(true)
	})

	it('fixes every schema budget at its documented exact whole number', () => {
		expect(COLUMN_LIMIT).toBe(256)
		expect(CHOICE_LIMIT).toBe(1024)
		expect(NAME_LIMIT).toBe(128)
		expect(STRING_LIMIT).toBe(65536)
		expect(TEXT_LIMIT).toBe(1048576)
		expect(NODE_LIMIT).toBe(16384)
		expect(
			[COLUMN_LIMIT, CHOICE_LIMIT, NAME_LIMIT, STRING_LIMIT, TEXT_LIMIT, NODE_LIMIT].every(
				(value) => Number.isSafeInteger(value) && value > 0,
			),
		).toBe(true)
	})
})
