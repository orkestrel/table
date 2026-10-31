import type { Emitter } from '@orkestrel/emitter'
import type { RowManagerInterface, GridEventMap, GridKey, GridRow, GridSchema } from '../types.js'
import { isArray } from '@orkestrel/contract'
import { cloneRow } from '../cloners.js'
import { GridError } from '../errors.js'
import { extractColumn, extractGridKey, matchesCell, matchesGridRow } from '../helpers.js'
import { isGridRow } from '../validators.js'

/** Manages the rows one grid holds in its own order. */
export class RowManager implements RowManagerInterface {
	readonly #schema: GridSchema
	readonly #emitter: Emitter<GridEventMap>
	readonly #gate: () => void
	readonly #read: () => readonly GridRow[]
	readonly #write: (rows: readonly GridRow[]) => void
	readonly #settle: (removed: readonly GridKey[], announce: () => void) => void

	/**
	 * Creates a row manager over one grid's private row store.
	 *
	 * @param schema - The grid schema.
	 * @param emitter - The grid's event emitter.
	 * @param gate - The grid lifecycle gate.
	 * @param read - A read of the current rows.
	 * @param write - The row commit boundary.
	 * @param settle - Commit dependent state, then order row and dependent announcements.
	 * @param rows - Rows to seed without announcements.
	 */
	constructor(
		schema: GridSchema,
		emitter: Emitter<GridEventMap>,
		gate: () => void,
		read: () => readonly GridRow[],
		write: (rows: readonly GridRow[]) => void,
		settle: (removed: readonly GridKey[], announce: () => void) => void,
		rows: readonly GridRow[] = [],
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

	/** Finds one row by key as an owned frozen snapshot. */
	row(key: GridKey): GridRow | undefined {
		const row = this.#read().find((candidate) => extractGridKey(this.#schema, candidate) === key)
		return row === undefined ? undefined : cloneRow(row)
	}

	/** Reads every row as owned frozen snapshots in grid order. */
	rows(): readonly GridRow[] {
		return Object.freeze(this.#read().map((row) => cloneRow(row)))
	}

	/** Appends several rows. */
	add(rows: readonly GridRow[]): void
	/** Appends one row. */
	add(row: GridRow): void
	/** Appends one row or several. */
	add(input: GridRow | readonly GridRow[]): void {
		this.#gate()
		const rows = isArray(input) ? input : [input]
		const keys = new Set<GridKey>()
		for (const row of this.#read()) {
			const key = extractGridKey(this.#schema, row)
			if (key !== undefined) keys.add(key)
		}
		const added = this.#prepare(rows, keys)
		if (added.length === 0) return

		this.#write(Object.freeze([...this.#read(), ...added]))
		this.#settle([], () => {
			for (const row of added) {
				const key = extractGridKey(this.#schema, row)
				if (key !== undefined) this.#emitter.emit('write', key)
			}
		})
	}

	/** Merges several rows into the rows their keys name. */
	update(rows: readonly GridRow[]): boolean
	/** Merges one row into the row its key names. */
	update(row: GridRow): boolean
	/** Merges one row or several into the rows their keys name. */
	update(input: GridRow | readonly GridRow[]): boolean {
		this.#gate()
		const updates = (isArray(input) ? input : [input]).map((row) => cloneRow(row))
		const current = this.#read()
		const locations: number[] = []

		for (const update of updates) {
			this.#validate(update)
			const key = extractGridKey(this.#schema, update)
			if (key === undefined) this.#failKey('A row has no usable identity')
			const index = current.findIndex((row) => extractGridKey(this.#schema, row) === key)
			if (index === -1) return false
			locations.push(index)
		}

		const next = [...current]
		const moved: GridKey[] = []
		for (const [index, update] of updates.entries()) {
			const location = locations[index]
			if (update === undefined || location === undefined) continue
			const previous = next[location]
			if (previous === undefined) continue
			const merged = cloneRow({ ...previous, ...update })
			if (!matchesGridRow(previous, merged)) {
				next[location] = merged
				const key = extractGridKey(this.#schema, merged)
				if (key !== undefined) moved.push(key)
			}
		}

		if (moved.length === 0) return true
		this.#write(Object.freeze(next))
		this.#settle([], () => {
			for (const key of moved) this.#emitter.emit('write', key)
		})
		return true
	}

	/** Replaces several complete rows. */
	replace(rows: readonly GridRow[]): boolean
	/** Replaces one complete row. */
	replace(row: GridRow): boolean
	/** Replaces complete rows atomically without removing their identities. */
	replace(input: GridRow | readonly GridRow[]): boolean {
		this.#gate()
		const replacements = (isArray(input) ? input : [input]).map((row) => cloneRow(row))
		const current = this.#read()
		const locations: number[] = []
		for (const row of replacements) {
			this.#validate(row)
			const location = current.findIndex(
				(candidate) =>
					extractGridKey(this.#schema, candidate) === extractGridKey(this.#schema, row),
			)
			if (location === -1) return false
			locations.push(location)
		}
		const next = [...current]
		const changed = new Set<GridKey>()
		for (const [index, row] of replacements.entries()) {
			const location = locations[index]
			if (location === undefined) continue
			next[location] = row
		}
		for (const location of locations) {
			const previous = current[location]
			const row = next[location]
			if (previous === undefined || row === undefined) continue
			const key = extractGridKey(this.#schema, row)
			if (key !== undefined && !matchesGridRow(previous, row)) changed.add(key)
		}
		if (changed.size === 0) return true
		this.#write(Object.freeze(next))
		this.#settle([], () => {
			for (const key of changed) this.#emitter.emit('write', key)
		})
		return true
	}

	/** Moves one row to a clamped index in grid order. */
	move(key: GridKey, index: number): boolean {
		this.#gate()
		const current = this.#read()
		const origin = current.findIndex((row) => extractGridKey(this.#schema, row) === key)
		if (origin === -1) return false
		const target = Math.min(
			current.length - 1,
			Number.isNaN(index) ? 0 : Math.max(0, Math.trunc(index)),
		)
		if (origin === target) return true

		const row = current[origin]
		if (row === undefined) return false
		const next = [...current]
		next.splice(origin, 1)
		next.splice(target, 0, row)
		this.#write(Object.freeze(next))
		this.#settle([], () => this.#emitter.emit('write', key))
		return true
	}

	/** Removes every row. */
	remove(): void
	/** Removes one row. */
	remove(key: GridKey): boolean
	/** Removes several rows. */
	remove(keys: readonly GridKey[]): boolean
	/** Removes one or more rows. */
	remove(input?: GridKey | readonly GridKey[]): void | boolean {
		this.#gate()
		const current = this.#read()
		const requested =
			input === undefined
				? current.flatMap((row) => {
						const key = extractGridKey(this.#schema, row)
						return key === undefined ? [] : [key]
					})
				: isArray(input)
					? input
					: [input]
		const keys = new Set(requested)
		const known = new Set(
			current.flatMap((row) => {
				const key = extractGridKey(this.#schema, row)
				return key === undefined ? [] : [key]
			}),
		)
		if ([...keys].some((key) => !known.has(key))) return false
		if (keys.size === 0) return input === undefined ? undefined : true

		const removed = current.flatMap((row) => {
			const key = extractGridKey(this.#schema, row)
			return key !== undefined && keys.has(key) ? [key] : []
		})
		this.#write(
			Object.freeze(
				current.filter((row) => {
					const key = extractGridKey(this.#schema, row)
					return key === undefined || !keys.has(key)
				}),
			),
		)
		this.#settle(removed, () => {
			for (const key of removed) this.#emitter.emit('remove', key)
		})
		return input === undefined ? undefined : true
	}

	#prepare(rows: readonly GridRow[], existing: Set<GridKey>): readonly GridRow[] {
		const owned: GridRow[] = []
		for (const row of rows) {
			const snapshot = cloneRow(row)
			this.#validate(snapshot)
			const key = extractGridKey(this.#schema, snapshot)
			if (key === undefined) this.#failKey('A row has no usable identity')
			if (existing.has(key)) this.#failKey(`Row key "${key}" is already taken`, key)
			existing.add(key)
			owned.push(snapshot)
		}
		return owned
	}

	#validate(row: GridRow): void {
		if (extractGridKey(this.#schema, row) === undefined)
			this.#failKey('A row has no usable identity')
		if (!isGridRow(row)) {
			throw new GridError('CELL', 'A row contains a value no grid cell can hold')
		}
		for (const key of Object.keys(row)) {
			const column = extractColumn(this.#schema, key)
			if (column === undefined || !matchesCell(column, row[key])) {
				throw new GridError('CELL', `Column "${key}" cannot hold that cell`, { column: key })
			}
		}
	}

	#failKey(message: string, key?: GridKey): never {
		if (key === undefined) throw new GridError('KEY', message)
		throw new GridError('KEY', message, { key })
	}
}
