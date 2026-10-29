import type { TableEventMap, TableKey } from '@src/core'
import { Emitter } from '@orkestrel/emitter'
import { createRecorder } from '@orkestrel/test'
import { describe, expect, it } from 'vitest'
import { KeyManager } from '../../../../src/core/tables/KeyManager.js'
import { KeyStore } from '../../../setup.js'

const rows: readonly TableKey[] = ['1', '2', '3']

describe('KeyManager', () => {
	it('applies the 0/1/N forms over the keys a caller may address', () => {
		const emitter = new Emitter<TableEventMap>()
		const held = new KeyStore()
		const keys = new KeyManager(
			emitter,
			'select',
			() => undefined,
			() => rows,
			() => held.keys,
			(next) => {
				held.keys = next
			},
		)

		expect(keys.change('1', () => true)).toBe(true)
		expect(keys.change(['2', '3'], () => true)).toBe(true)
		expect(keys.change(undefined, () => false)).toBeUndefined()
		expect(keys.keys.size).toBe(0)
	})

	it('refuses a batch naming an unknown key without moving the set', () => {
		const emitter = new Emitter<TableEventMap>()
		const held = new KeyStore(['1'])
		const keys = new KeyManager(
			emitter,
			'expand',
			() => undefined,
			() => rows,
			() => held.keys,
			(next) => {
				held.keys = next
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
		const held = new KeyStore()
		const keys = new KeyManager(
			emitter,
			'expand',
			() => undefined,
			() => rows,
			() => held.keys,
			(next) => {
				held.keys = next
			},
		)

		keys.change('1', () => true)
		keys.change('1', () => true)

		expect(expansions.count).toBe(1)
		expect(selections.count).toBe(0)
	})

	it('hands back an owned key set and passes the gate throw through', () => {
		const emitter = new Emitter<TableEventMap>()
		const held = new KeyStore(['1'])
		const open = new KeyManager(
			emitter,
			'select',
			() => undefined,
			() => rows,
			() => held.keys,
			(next) => {
				held.keys = next
			},
		)
		const closed = new KeyManager(
			emitter,
			'select',
			() => {
				throw new Error('gated')
			},
			() => rows,
			() => held.keys,
			(next) => {
				held.keys = next
			},
		)

		expect(open.keys).not.toBe(held.keys)
		expect([...open.keys]).toStrictEqual(['1'])
		expect(() => closed.change('2', () => true)).toThrow('gated')
		expect([...open.keys]).toStrictEqual(['1'])
	})
})
