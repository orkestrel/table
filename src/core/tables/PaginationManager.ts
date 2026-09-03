import type { Emitter } from '@orkestrel/emitter'
import type { PaginationManagerInterface, TableEventMap } from '../types.js'

/** Manages the page arithmetic over one table's filtered rows. */
export class PaginationManager implements PaginationManagerInterface {
	readonly #emitter: Emitter<TableEventMap>
	readonly #gate: () => void
	readonly #rows: () => number
	readonly #readPage: () => number
	readonly #writePage: (page: number) => void
	readonly #readLimit: () => number | undefined
	readonly #writeLimit: (limit: number | undefined) => void

	/**
	 * Creates a pagination manager over one table's private stores.
	 *
	 * @param emitter - The table's event emitter.
	 * @param gate - The table lifecycle gate.
	 * @param rows - A read of the filtered row count.
	 * @param readPage - A read of the current page.
	 * @param writePage - The page commit boundary.
	 * @param readLimit - A read of the current page size.
	 * @param writeLimit - The page-size commit boundary.
	 */
	constructor(
		emitter: Emitter<TableEventMap>,
		gate: () => void,
		rows: () => number,
		readPage: () => number,
		writePage: (page: number) => void,
		readLimit: () => number | undefined,
		writeLimit: (limit: number | undefined) => void,
	) {
		this.#emitter = emitter
		this.#gate = gate
		this.#rows = rows
		this.#readPage = readPage
		this.#writePage = writePage
		this.#readLimit = readLimit
		this.#writeLimit = writeLimit

		const limit = this.#readLimit()
		if (limit !== undefined) this.#writeLimit(this.#normalize(limit))
	}

	/** Returns the page shown, counted from one. */
	get page(): number {
		return this.#readLimit() === undefined ? 1 : this.#readPage()
	}

	/** Returns the number of rows one page holds. */
	get limit(): number | undefined {
		return this.#readLimit()
	}

	/** Returns the number of filtered rows skipped before this page. */
	get offset(): number {
		const limit = this.#readLimit()
		return limit === undefined ? 0 : (this.#readPage() - 1) * limit
	}

	/** Returns the number of pages filled by the filtered rows. */
	get count(): number {
		const limit = this.#readLimit()
		return limit === undefined ? 1 : Math.max(1, Math.ceil(this.#rows() / limit))
	}

	/** Shows another page, clamped to the pages that exist. */
	move(page: number): void {
		this.#gate()
		const next =
			this.#readLimit() === undefined || Number.isNaN(page)
				? 1
				: Math.min(this.count, Math.max(1, Math.trunc(page)))
		if (next === this.#readPage()) return
		this.#writePage(next)
		this.#emitter.emit('paginate', next)
	}

	/** Changes the page size while keeping the first row previously shown. */
	resize(limit?: number): void {
		this.#gate()
		const previous = this.#readLimit()
		const nextLimit = limit === undefined ? undefined : this.#normalize(limit)
		if (previous === nextLimit) return

		const anchor = previous === undefined ? 0 : (this.#readPage() - 1) * previous
		this.#writeLimit(nextLimit)
		const nextPage =
			nextLimit === undefined
				? 1
				: Math.min(Math.max(1, Math.floor(anchor / nextLimit) + 1), this.count)
		this.#writePage(nextPage)
		this.#emitter.emit('paginate', nextPage)
	}

	#normalize(value: number): number {
		return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1
	}
}
