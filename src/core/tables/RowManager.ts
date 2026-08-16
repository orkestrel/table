import type { Emitter } from '@orkestrel/emitter'
import type {
	RowManagerInterface,
	TableEventMap,
	TableKey,
	TableRow,
	TableSchema,
} from '../types.js'
import { cloneRow } from '../cloners.js'
import { TableError } from '../errors.js'
import { extractColumn, extractKey, matchesCell } from '../helpers.js'
import { isTableRow } from '../validators.js'

/** The rows one table holds in its own order. */
export class RowManager implements RowManagerInterface {
	readonly #schema: TableSchema
	readonly #emitter: Emitter<TableEventMap>
	readonly #gate: () => void
	readonly #read: () => readonly TableRow[]
	readonly #write: (rows: readonly TableRow[]) => void
	readonly #settle: (removed: readonly TableKey[]) => void

	/**
	 * Create a row manager over one table's private row store.
	 *
	 * @param schema - The table schema.
	 * @param emitter - The table's event emitter.
	 * @param gate - The table lifecycle gate.
	 * @param read - A read of the current rows.
	 * @param write - The row commit boundary.
	 * @param settle - The key-pruning and pagination step after a row commit.
	 * @param rows - Rows to seed without announcements.
	 */
	constructor(
		schema: TableSchema,
		emitter: Emitter<TableEventMap>,
		gate: () => void,
		read: () => readonly TableRow[],
		write: (rows: readonly TableRow[]) => void,
		settle: (removed: readonly TableKey[]) => void,
		rows: readonly TableRow[] = [],
	) {
		this.#schema = schema
		this.#emitter = emitter
		this.#gate = gate
		this.#read = read
		this.#write = write
		this.#settle = settle

		const seeded = this.#prepare(rows, new Set())
		if (seeded.length > 0) this.#write(Object.freeze(seeded))
	}

	/** Find one row by key as an owned frozen snapshot. */
	row(key: TableKey): TableRow | undefined {
		const row = this.#read().find((candidate) => extractKey(this.#schema, candidate) === key)
		return row === undefined ? undefined : cloneRow(row)
	}

	/** Read every row as owned frozen snapshots in table order. */
	rows(): readonly TableRow[] {
		return Object.freeze(this.#read().map((row) => cloneRow(row)))
	}

	/** Append several rows. */
	add(rows: readonly TableRow[]): void
	/** Append one row. */
	add(row: TableRow): void
	/** Append one row or several. */
	add(input: TableRow | readonly TableRow[]): void {
		this.#gate()
		const rows = Array.isArray(input) ? input : [input]
		const keys = new Set<TableKey>()
		for (const row of this.#read()) {
			const key = extractKey(this.#schema, row)
			if (key !== undefined) keys.add(key)
		}
		const added = this.#prepare(rows, keys)
		if (added.length === 0) return

		this.#write(Object.freeze([...this.#read(), ...added]))
		for (const row of added) {
			const key = extractKey(this.#schema, row)
			if (key !== undefined) this.#emitter.emit('write', key)
		}
	}

	/** Merge several rows into the rows their keys name. */
	update(rows: readonly TableRow[]): boolean
	/** Merge one row into the row its key names. */
	update(row: TableRow): boolean
	/** Merge one row or several into the rows their keys name. */
	update(input: TableRow | readonly TableRow[]): boolean {
		this.#gate()
		const updates = (Array.isArray(input) ? input : [input]).map((row) => cloneRow(row))
		const current = this.#read()
		const locations: number[] = []

		for (const update of updates) {
			this.#validate(update)
			const key = extractKey(this.#schema, update)
			if (key === undefined) this.#failKey('A row has no usable identity')
			const index = current.findIndex((row) => extractKey(this.#schema, row) === key)
			if (index === -1) return false
			locations.push(index)
		}

		const next = [...current]
		const moved: TableKey[] = []
		for (let index = 0; index < updates.length; index += 1) {
			const update = updates[index]
			const location = locations[index]
			if (update === undefined || location === undefined) continue
			const previous = next[location]
			if (previous === undefined) continue
			const merged = cloneRow({ ...previous, ...update })
			if (!this.#same(previous, merged)) {
				next[location] = merged
				const key = extractKey(this.#schema, merged)
				if (key !== undefined) moved.push(key)
			}
		}

		if (moved.length === 0) return true
		this.#write(Object.freeze(next))
		for (const key of moved) this.#emitter.emit('write', key)
		this.#settle([])
		return true
	}

	/** Move one row to a clamped index in table order. */
	move(key: TableKey, index: number): boolean {
		this.#gate()
		const current = this.#read()
		const origin = current.findIndex((row) => extractKey(this.#schema, row) === key)
		if (origin === -1) return false
		const target = Math.min(
			current.length - 1,
			Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0,
		)
		if (origin === target) return true

		const row = current[origin]
		if (row === undefined) return false
		const next = [...current]
		next.splice(origin, 1)
		next.splice(target, 0, row)
		this.#write(Object.freeze(next))
		this.#emitter.emit('write', key)
		return true
	}

	/** Remove every row. */
	remove(): void
	/** Remove one row. */
	remove(key: TableKey): boolean
	/** Remove several rows. */
	remove(keys: readonly TableKey[]): boolean
	/** Remove one or more rows. */
	remove(input?: TableKey | readonly TableKey[]): void | boolean {
		this.#gate()
		const current = this.#read()
		const requested =
			input === undefined
				? current.flatMap((row) => {
						const key = extractKey(this.#schema, row)
						return key === undefined ? [] : [key]
					})
				: Array.isArray(input)
					? input
					: [input]
		const keys = new Set(requested)
		const known = new Set(
			current.flatMap((row) => {
				const key = extractKey(this.#schema, row)
				return key === undefined ? [] : [key]
			}),
		)
		if ([...keys].some((key) => !known.has(key))) return false
		if (keys.size === 0) return input === undefined ? undefined : true

		const removed = current.flatMap((row) => {
			const key = extractKey(this.#schema, row)
			return key !== undefined && keys.has(key) ? [key] : []
		})
		this.#write(
			Object.freeze(
				current.filter((row) => {
					const key = extractKey(this.#schema, row)
					return key === undefined || !keys.has(key)
				}),
			),
		)
		for (const key of removed) this.#emitter.emit('remove', key)
		this.#settle(removed)
		return input === undefined ? undefined : true
	}

	#prepare(rows: readonly TableRow[], existing: Set<TableKey>): readonly TableRow[] {
		const owned: TableRow[] = []
		for (const row of rows) {
			const snapshot = cloneRow(row)
			this.#validate(snapshot)
			const key = extractKey(this.#schema, snapshot)
			if (key === undefined) this.#failKey('A row has no usable identity')
			if (existing.has(key)) this.#failKey(`Row key "${key}" is already taken`, key)
			existing.add(key)
			owned.push(snapshot)
		}
		return owned
	}

	#validate(row: TableRow): void {
		if (extractKey(this.#schema, row) === undefined) this.#failKey('A row has no usable identity')
		if (!isTableRow(row)) {
			throw new TableError('CELL', 'A row contains a value no table cell can hold')
		}
		for (const key of Object.keys(row)) {
			const column = extractColumn(this.#schema, key)
			if (column === undefined || !matchesCell(column, row[key])) {
				throw new TableError('CELL', `Column "${key}" cannot hold that cell`, { column: key })
			}
		}
	}

	#failKey(message: string, key?: TableKey): never {
		if (key === undefined) throw new TableError('KEY', message)
		throw new TableError('KEY', message, { key })
	}

	#same(left: TableRow, right: TableRow): boolean {
		const leftKeys = Object.keys(left)
		const rightKeys = Object.keys(right)
		return (
			leftKeys.length === rightKeys.length &&
			leftKeys.every((key) => Object.hasOwn(right, key) && left[key] === right[key])
		)
	}
}
