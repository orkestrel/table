import type { Emitter } from '@orkestrel/emitter'
import type { SelectionManagerInterface, TableEventMap, TableKey } from '../types.js'
import { KeyManager } from './KeyManager.js'

/** The keys of the rows somebody has picked. */
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

	/** The keys of the rows picked right now. */
	get keys(): ReadonlySet<TableKey> {
		return this.#keys.keys
	}

	/** Pick every row the table holds. */
	select(): void
	/** Pick one row. */
	select(key: TableKey): boolean
	/** Pick several rows. */
	select(keys: readonly TableKey[]): boolean
	/** Pick one or more rows. */
	select(input?: TableKey | readonly TableKey[]): void | boolean {
		return this.#keys.change(input, () => true)
	}

	/** Drop every pick. */
	clear(): void
	/** Drop one pick. */
	clear(key: TableKey): boolean
	/** Drop several picks. */
	clear(keys: readonly TableKey[]): boolean
	/** Drop one or more picks. */
	clear(input?: TableKey | readonly TableKey[]): void | boolean {
		return this.#keys.change(input, () => false)
	}

	/** Pick one row or drop it when already picked. */
	toggle(key: TableKey): boolean
	/** Turn several rows around independently. */
	toggle(keys: readonly TableKey[]): boolean
	/** Turn one or more rows around independently. */
	toggle(input: TableKey | readonly TableKey[]): boolean {
		return this.#keys.change(input, (included) => !included) === true
	}
}
