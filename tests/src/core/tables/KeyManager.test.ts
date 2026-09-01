import type { TableEventMap, TableKey } from '@src/core'
import { Emitter } from '@orkestrel/emitter'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { KeyManager } from '../../../../src/core/tables/KeyManager.js'

const rows: readonly TableKey[] = ['1', '2', '3']

describe('KeyManager', () => {
	it('applies the 0/1/N forms over the keys a caller may address', () => {
		const emitter = new Emitter<TableEventMap>()
		let held: ReadonlySet<TableKey> = new Set()
		const keys = new KeyManager(
			emitter,
			'select',
			() => undefined,
			() => rows,
			() => held,
			(next) => {
				held = next
			},
		)

		expect(keys.change('1', () => true)).toBe(true)
		expect(keys.change(['2', '3'], () => true)).toBe(true)
		expect(keys.change(undefined, () => false)).toBeUndefined()
		expect(keys.keys.size).toBe(0)
	})

	it('refuses a batch naming an unknown key without moving the set', () => {
		const emitter = new Emitter<TableEventMap>()
		let held: ReadonlySet<TableKey> = new Set(['1'])
		const keys = new KeyManager(
			emitter,
			'expand',
			() => undefined,
			() => rows,
			() => held,
			(next) => {
				held = next
			},
		)

		expect(keys.change(['2', 'missing'], () => true)).toBe(false)
		expect([...keys.keys]).toStrictEqual(['1'])
	})

	it('announces its own event only when the set moves', () => {
		const emitter = new Emitter<TableEventMap>()
		const expansions = createRecorder<TableEventMap['expand']>()
		const selections = createRecorder<TableEventMap['select']>()
		emitter.on('expand', expansions.handler)
		emitter.on('select', selections.handler)
		let held: ReadonlySet<TableKey> = new Set()
		const keys = new KeyManager(
			emitter,
			'expand',
			() => undefined,
			() => rows,
			() => held,
			(next) => {
				held = next
			},
		)

		keys.change('1', () => true)
		keys.change('1', () => true)

		expect(expansions.count).toBe(1)
		expect(selections.count).toBe(0)
	})

	it('hands back an owned key set and passes the gate throw through', () => {
		const emitter = new Emitter<TableEventMap>()
		let held: ReadonlySet<TableKey> = new Set(['1'])
		const open = new KeyManager(
			emitter,
			'select',
			() => undefined,
			() => rows,
			() => held,
			(next) => {
				held = next
			},
		)
		const closed = new KeyManager(
			emitter,
			'select',
			() => {
				throw new Error('gated')
			},
			() => rows,
			() => held,
			(next) => {
				held = next
			},
		)

		expect(open.keys).not.toBe(held)
		expect([...open.keys]).toStrictEqual(['1'])
		expect(() => closed.change('2', () => true)).toThrow('gated')
		expect([...open.keys]).toStrictEqual(['1'])
	})
})
