import type { Emitter } from '@orkestrel/emitter'
import type { SelectionManagerInterface, TableEventMap, TableKey } from '../types.js'
import { KeyManager } from './KeyManager.js'

/** Manages the keys of the rows somebody has picked. */
export class SelectionManager implements SelectionManagerInterface {
	readonly #keys: KeyManager

	/**
	 * Creates a selection manager over one table's private stores.
	 *
	 * @param emitter - The table's event emitter.
	 * @param gate - The table lifecycle gate.
	 * @param rows - A read of every row key.
	 * @param read - A read of the selected keys.
	 * @param write - The selected-key commit boundary.
	 */
	constructor(
		emitter: Emitter<TableEventMap>,
		gate: () => void,
		rows: () => readonly TableKey[],
		read: () => ReadonlySet<TableKey>,
		write: (keys: ReadonlySet<TableKey>) => void,
	) {
		this.#keys = new KeyManager(emitter, 'select', gate, rows, read, write)
	}

	/** Returns the keys of the rows picked right now. */
	get keys(): ReadonlySet<TableKey> {
		return this.#keys.keys
	}

	/** Picks every row the table holds. */
	select(): void
	/** Picks one row. */
	select(key: TableKey): boolean
	/** Picks several rows. */
	select(keys: readonly TableKey[]): boolean
	/** Picks one or more rows. */
	select(input?: TableKey | readonly TableKey[]): void | boolean {
		return this.#keys.change(input, () => true)
	}

	/** Drops every pick. */
	clear(): void
	/** Drops one pick. */
	clear(key: TableKey): boolean
	/** Drops several picks. */
	clear(keys: readonly TableKey[]): boolean
	/** Drops one or more picks. */
	clear(input?: TableKey | readonly TableKey[]): void | boolean {
		return this.#keys.change(input, () => false)
	}

	/** Picks one row or drops it when already picked. */
	toggle(key: TableKey): boolean
	/** Turns several rows around independently. */
	toggle(keys: readonly TableKey[]): boolean
	/** Turns one or more rows around independently. */
	toggle(input: TableKey | readonly TableKey[]): boolean {
		return this.#keys.change(input, (included) => !included) === true
	}
}
