import type { Emitter } from '@orkestrel/emitter'
import type { ExpansionManagerInterface, TableEventMap, TableKey } from '../types.js'
import { KeyManager } from './KeyManager.js'

/** The keys of the rows somebody has opened. */
export class ExpansionManager implements ExpansionManagerInterface {
	readonly #keys: KeyManager

	/**
	 * Creates an expansion manager over one table's private stores.
	 *
	 * @param emitter - The table's event emitter.
	 * @param gate - The table lifecycle gate.
	 * @param rows - A read of every row key.
	 * @param read - A read of the expanded keys.
	 * @param write - The expanded-key commit boundary.
	 */
	constructor(
		emitter: Emitter<TableEventMap>,
		gate: () => void,
		rows: () => readonly TableKey[],
		read: () => ReadonlySet<TableKey>,
		write: (keys: ReadonlySet<TableKey>) => void,
	) {
		this.#keys = new KeyManager(emitter, 'expand', gate, rows, read, write)
	}

	/** The keys of the rows opened right now. */
	get keys(): ReadonlySet<TableKey> {
		return this.#keys.keys
	}

	/** Open every row the table holds. */
	expand(): void
	/** Open one row. */
	expand(key: TableKey): boolean
	/** Open several rows. */
	expand(keys: readonly TableKey[]): boolean
	/** Open one or more rows. */
	expand(input?: TableKey | readonly TableKey[]): void | boolean {
		return this.#keys.change(input, () => true)
	}

	/** Close every row. */
	clear(): void
	/** Close one row. */
	clear(key: TableKey): boolean
	/** Close several rows. */
	clear(keys: readonly TableKey[]): boolean
	/** Close one or more rows. */
	clear(input?: TableKey | readonly TableKey[]): void | boolean {
		return this.#keys.change(input, () => false)
	}

	/** Open one row or close it when already open. */
	toggle(key: TableKey): boolean
	/** Turn several rows around independently. */
	toggle(keys: readonly TableKey[]): boolean
	/** Turn one or more rows around independently. */
	toggle(input: TableKey | readonly TableKey[]): boolean {
		return this.#keys.change(input, (included) => !included) === true
	}
}
