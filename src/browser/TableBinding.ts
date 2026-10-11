import type { EmitterInterface } from '@orkestrel/emitter'
import type { TableInterface, TableRow } from '../core/types.js'
import type { TableBindingEventMap, TableBindingInterface, TableBindingOptions } from './types.js'
import { attempt } from '@orkestrel/contract'
import { Emitter } from '@orkestrel/emitter'
import { extractKey, matchesTableRow } from '../core/helpers.js'
import { TableBindingError } from './errors.js'
import { readTableRows, readTableSchema } from './helpers.js'

/** Retains keyed native rows while projecting every core table manager. */
export class TableBinding implements TableBindingInterface {
	readonly #element: HTMLTableElement
	readonly #document: TableInterface
	readonly #options: TableBindingOptions
	readonly #body: HTMLTableSectionElement
	readonly #scope: HTMLElement
	readonly #emitter: Emitter<TableBindingEventMap>
	readonly #lifetime = new AbortController()
	readonly #observer: MutationObserver
	readonly #rows = new Map<string, HTMLTableRowElement>()
	readonly #values = new Map<string, TableRow>()
	readonly #details = new Map<string, HTMLTableRowElement>()
	readonly #detailValues = new Map<string, TableRow>()
	readonly #visible = new Set<HTMLTableRowElement>()
	readonly #attributes = new Map<
		Element,
		Map<string, { readonly original: string | null; value: string | null }>
	>()
	readonly #checks = new Map<
		HTMLInputElement,
		{ readonly checked: boolean; readonly indeterminate: boolean; value: boolean; mixed: boolean }
	>()
	readonly #schedule = this.#enqueue.bind(this)
	readonly #subscriptions: Array<() => void> = []
	#pending: ReturnType<typeof setTimeout> | undefined
	#rendering = false
	#requesting = false
	#records: MutationRecord[] = []

	/** Creates a native binding over a borrowed document.
	 * @param element - The table whose body the binding owns.
	 * @param document - The core document retained by the caller.
	 * @param options - Row ownership, detail renderer, controls, and listeners.
	 */
	constructor(
		element: HTMLTableElement,
		document: TableInterface,
		options: TableBindingOptions = {},
	) {
		if (element.tBodies.length !== 1 || document.destroyed)
			throw new TableBindingError('STRUCTURE', 'Bind one table body to a live document')
		const body = element.tBodies[0]
		if (body === undefined) throw new TableBindingError('STRUCTURE', 'The table has no body')
		this.#element = element
		this.#document = document
		this.#options = { ...options }
		this.#body = body
		this.#scope = options.scope ?? element
		if (!this.#scope.contains(element))
			throw new TableBindingError('STRUCTURE', 'The scope must contain the table')
		this.#emitter = new Emitter<TableBindingEventMap>({
			...(options.on === undefined ? {} : { on: options.on }),
			...(options.error === undefined ? {} : { error: options.error }),
		})
		this.#observer = new MutationObserver((records) => {
			this.#records.push(...records)
			this.#enqueue()
		})
		if (options.row === undefined) {
			this.#validateSchema()
			const elements = Array.from(body.rows)
			const rows = readTableRows(document.schema, elements)
			if (
				rows.length !== document.rows.rows().length ||
				rows.some((row) => {
					const key = extractKey(document.schema, row)
					return key === undefined || !matchesTableRow(document.rows.row(key), row)
				})
			)
				throw new TableBindingError('STRUCTURE', 'Authored rows must match the supplied document')
			for (const [index, row] of rows.entries()) {
				const key = extractKey(document.schema, row)
				const node = elements[index]
				if (key !== undefined && node !== undefined) this.#rows.set(key, node)
			}
		} else if (body.rows.length > 0) {
			throw new TableBindingError('STRUCTURE', 'Model rendering requires an empty body')
		}
		for (const event of [
			'write',
			'remove',
			'sort',
			'filter',
			'select',
			'expand',
			'paginate',
			'clear',
		] as const) {
			document.emitter.on(event, this.#schedule)
			this.#subscriptions.push(() => document.emitter.off(event, this.#schedule))
		}
		element.addEventListener('click', (event) => this.#click(event), {
			signal: this.#lifetime.signal,
		})
		this.#scope.addEventListener('change', (event) => this.#change(event), {
			signal: this.#lifetime.signal,
		})
		this.#observe()
		this.refresh()
	}

	get element(): HTMLTableElement {
		return this.#element
	}
	get document(): TableInterface {
		return this.#document
	}
	get destroyed(): boolean {
		return this.#lifetime.signal.aborted
	}
	get emitter(): EmitterInterface<TableBindingEventMap> {
		return this.#emitter
	}

	/** Reconciles native input and retries rendering against the current document. */
	refresh(): void {
		if (this.destroyed) return
		if (this.#rendering) {
			this.#enqueue()
			return
		}
		if (this.#pending !== undefined) clearTimeout(this.#pending)
		this.#pending = undefined
		this.#rendering = true
		const outcome = attempt(() => {
			this.#records.push(...this.#observer.takeRecords())
			if (this.#options.row === undefined && this.#records.length > 0) this.#reconcile()
			if (!this.destroyed) this.#render()
		})
		if (!outcome.success && !this.destroyed) this.#emitter.emit('error', outcome.error)
		else if (!this.destroyed) this.#emitter.emit('render')
		this.#rendering = false
	}

	/** Releases native resources and restores authored state while retaining the core document. */
	destroy(): void {
		if (this.destroyed) return
		const active = this.#element.ownerDocument.activeElement
		const focused =
			active instanceof HTMLElement && [...this.#rows.values()].some((row) => row.contains(active))
				? active
				: undefined
		this.#lifetime.abort()
		if (this.#pending !== undefined) clearTimeout(this.#pending)
		this.#pending = undefined
		this.#observer.disconnect()
		for (const unsubscribe of this.#subscriptions) unsubscribe()
		this.#subscriptions.length = 0
		for (const detail of this.#details.values()) detail.remove()
		if (this.#options.row === undefined) {
			for (const row of this.#document.rows.rows()) {
				const key = extractKey(this.#document.schema, row)
				const node = key === undefined ? undefined : this.#rows.get(key)
				if (node !== undefined) this.#place(node, null)
			}
		}
		for (const element of this.#attributes.keys()) this.#release(element)
		for (const input of this.#checks.keys()) this.#release(input)
		this.#restoreFocus(focused)
		this.#rows.clear()
		this.#values.clear()
		this.#details.clear()
		this.#detailValues.clear()
		this.#attributes.clear()
		this.#checks.clear()
		this.#visible.clear()
		this.#records = []
		this.#emitter.destroy()
	}

	#enqueue(): void {
		if (this.destroyed || this.#pending !== undefined) return
		this.#pending = setTimeout(() => {
			this.#pending = undefined
			this.refresh()
		}, 0)
	}

	#observe(): void {
		if (this.destroyed || this.#options.row !== undefined) return
		this.#records.push(...this.#observer.takeRecords())
		this.#observer.disconnect()
		this.#observer.observe(this.#element, {
			childList: true,
			characterData: true,
			subtree: true,
			attributes: true,
			attributeFilter: [
				'data-table-key',
				'data-table-column',
				'data-table-cell',
				'data-table-choices',
				'value',
				'datetime',
			],
		})
		for (const node of this.#rows.values())
			if (node.parentElement !== this.#body)
				this.#observer.observe(node, {
					childList: true,
					characterData: true,
					subtree: true,
					attributes: true,
					attributeFilter: ['data-table-key', 'data-table-column', 'value', 'datetime'],
				})
	}

	#validateSchema(): void {
		const schema = readTableSchema(this.#element)
		if (
			schema.key !== this.#document.schema.key ||
			schema.columns.length !== this.#document.schema.columns.length ||
			schema.columns.some((column, index) => {
				const declared = this.#document.schema.columns[index]
				return (
					declared?.key !== column.key ||
					declared.cell !== column.cell ||
					(column.cell === 'choice' &&
						declared.cell === 'choice' &&
						JSON.stringify(column.choices) !== JSON.stringify(declared.choices))
				)
			})
		)
			throw new TableBindingError('STRUCTURE', 'Header metadata must match the supplied schema')
	}

	#reconcile(): void {
		this.#validateSchema()
		const retained = Array.from(this.#rows).filter(
			([, node]) => !this.#visible.has(node) || node.parentElement === this.#body,
		)
		const elements = retained.map(([, node]) => node)
		for (const node of this.#body.rows)
			if (!elements.includes(node) && !Array.from(this.#details.values()).includes(node))
				elements.push(node)
		const rows = readTableRows(this.#document.schema, elements)
		this.#records = []
		const keys = new Set(this.#keys(rows))
		const additions: TableRow[] = []
		const replacements: TableRow[] = []
		for (const row of rows) {
			const key = extractKey(this.#document.schema, row)
			if (key !== undefined && this.#document.rows.row(key) === undefined) additions.push(row)
			else replacements.push(row)
		}
		this.#document.rows.replace(replacements)
		if (this.destroyed) return
		this.#document.rows.add(additions)
		if (this.destroyed) return
		for (const key of this.#rows.keys())
			if (!keys.has(key)) {
				this.#document.rows.remove(key)
				if (this.destroyed) return
			}
		for (const [index, row] of rows.entries()) {
			const key = extractKey(this.#document.schema, row)
			const node = elements[index]
			if (key !== undefined && node !== undefined) this.#rows.set(key, node)
		}
	}

	#render(): void {
		const active = this.#element.ownerDocument.activeElement
		const focused =
			active instanceof HTMLElement &&
			[...this.#rows.values(), ...this.#details.values()].some((row) => row.contains(active))
				? active
				: undefined
		const stored = this.#document.rows.rows()
		const keys = new Set(this.#keys(stored))
		for (const [key, node] of this.#rows)
			if (!keys.has(key)) {
				this.#place(node)
				this.#release(node)
				const detail = this.#details.get(key)
				if (detail !== undefined) this.#place(detail)
				this.#rows.delete(key)
				this.#values.delete(key)
				this.#details.delete(key)
				this.#detailValues.delete(key)
			}
		const view = this.#document.view
		const ordered: HTMLTableRowElement[] = []
		for (const row of view) {
			const key = extractKey(this.#document.schema, row)
			if (key === undefined) continue
			let node = this.#rows.get(key)
			if (node === undefined) {
				if (this.#options.row === undefined)
					throw new TableBindingError('STRUCTURE', 'An authored document row has no native row')
				node = this.#element.ownerDocument.createElement('tr')
				node.setAttribute('data-table-key', key)
				this.#rows.set(key, node)
			}
			if (this.#options.row !== undefined && !matchesTableRow(this.#values.get(key), row)) {
				this.#options.row(node, row)
				if (this.destroyed) return
				this.#values.set(key, row)
			}
			ordered.push(node)
			const detail = this.#detail(key, row)
			if (this.destroyed) return
			if (detail !== undefined) ordered.push(detail)
			this.#controls(node, key, detail)
		}
		for (const node of [...this.#rows.values(), ...this.#details.values()])
			if (!ordered.includes(node) && node.parentElement === this.#body) this.#place(node)
		for (const [index, node] of ordered.entries())
			if (this.#body.rows[index] !== node) this.#place(node, this.#body.rows[index] ?? null)
		this.#visible.clear()
		for (const node of this.#rows.values())
			if (node.parentElement === this.#body) this.#visible.add(node)
		this.#headers()
		this.#pages(view)
		this.#restoreFocus(focused, true)
		this.#observe()
		if (this.#records.length > 0) this.#enqueue()
	}

	#restoreFocus(focused: HTMLElement | undefined, hidden = false): void {
		if (
			focused !== undefined &&
			this.#element.ownerDocument.activeElement !== focused &&
			(this.#element.ownerDocument.activeElement === this.#element.ownerDocument.body ||
				this.#element.ownerDocument.activeElement === null)
		) {
			if (focused.isConnected) focused.focus({ preventScroll: true })
			else if (hidden) {
				this.#attribute(this.#element, 'tabindex', '-1')
				if (
					!this.#element.hasAttribute('aria-label') &&
					!this.#element.hasAttribute('aria-labelledby') &&
					this.#element.caption === null
				)
					this.#attribute(this.#element, 'aria-label', this.#document.schema.label ?? 'Table')
				this.#element.focus({ preventScroll: true })
			}
		}
	}

	#detail(key: string, row: TableRow): HTMLTableRowElement | undefined {
		if (this.#options.detail === undefined || !this.#document.expansion.keys.has(key))
			return undefined
		let detail = this.#details.get(key)
		if (detail === undefined) {
			detail = this.#element.ownerDocument.createElement('tr')
			detail.id = `table-detail-${crypto.randomUUID()}`
			detail.insertCell().colSpan = Math.max(
				1,
				this.#rows.get(key)?.cells.length ?? this.#document.schema.columns.length,
			)
			this.#details.set(key, detail)
		}
		if (!matchesTableRow(this.#detailValues.get(key), row)) {
			this.#options.detail(detail, row)
			if (!this.destroyed) this.#detailValues.set(key, row)
		}
		return detail
	}

	#place(node: HTMLTableRowElement, before?: HTMLTableRowElement | null): void {
		this.#records.push(...this.#observer.takeRecords())
		this.#observer.disconnect()
		if (before === undefined) node.remove()
		else if (
			typeof this.#body.moveBefore === 'function' &&
			node.isConnected &&
			this.#body.isConnected
		)
			this.#body.moveBefore(node, before)
		else this.#body.insertBefore(node, before)
		this.#observe()
	}

	#attribute(element: Element, name: string, value: string | null): void {
		let attributes = this.#attributes.get(element)
		if (attributes === undefined) {
			attributes = new Map()
			this.#attributes.set(element, attributes)
		}
		const entry = attributes.get(name)
		if (entry === undefined) attributes.set(name, { original: element.getAttribute(name), value })
		else entry.value = value
		if (value === null) element.removeAttribute(name)
		else if (element.getAttribute(name) !== value) element.setAttribute(name, value)
	}

	#release(root: Element): void {
		for (const [element, attributes] of this.#attributes)
			if (root.contains(element)) {
				for (const [name, entry] of attributes)
					if (element.getAttribute(name) === entry.value) {
						if (entry.original === null) element.removeAttribute(name)
						else element.setAttribute(name, entry.original)
					}
				this.#attributes.delete(element)
			}
		for (const [input, state] of this.#checks)
			if (root.contains(input)) {
				if (input.checked === state.value) input.checked = state.checked
				if (input.indeterminate === state.mixed) input.indeterminate = state.indeterminate
				this.#checks.delete(input)
			}
	}

	#check(input: HTMLInputElement, value: boolean, mixed: boolean): void {
		const state = this.#checks.get(input)
		if (state === undefined)
			this.#checks.set(input, {
				checked: input.checked,
				indeterminate: input.indeterminate,
				value,
				mixed,
			})
		else {
			state.value = value
			state.mixed = mixed
		}
		input.checked = value
		input.indeterminate = mixed
	}

	#controls(node: HTMLTableRowElement, key: string, detail: HTMLTableRowElement | undefined): void {
		const table = node.closest('table')
		for (const input of node.querySelectorAll('input[type="checkbox"][data-table-select]'))
			if (input instanceof HTMLInputElement && input.closest('table') === table)
				this.#check(input, this.#document.selection.keys.has(key), false)
		for (const button of node.querySelectorAll('button[data-table-expand]'))
			if (button.closest('table') === table) {
				this.#attribute(button, 'aria-expanded', String(this.#document.expansion.keys.has(key)))
				this.#attribute(button, 'aria-controls', detail?.id ?? null)
			}
	}

	#headers(): void {
		const orders = this.#document.sort.orders()
		for (const button of this.#element.tHead?.querySelectorAll('button[data-table-sort]') ?? []) {
			if (button.closest('table') !== this.#element) continue
			const header = button.closest('th')
			if (header === null) continue
			const column = button.getAttribute('data-table-sort')
			const index = orders.findIndex((order) => order.column === column)
			const order = orders[index]
			this.#attribute(
				header,
				'aria-sort',
				index === 0 && order !== undefined ? order.direction : null,
			)
			this.#attribute(
				button,
				'aria-description',
				order === undefined
					? null
					: `Sort priority ${index + 1} of ${orders.length}, ${order.direction}`,
			)
		}
	}

	#pages(view: readonly TableRow[]): void {
		const selected = view.filter((row) => {
			const key = extractKey(this.#document.schema, row)
			return key !== undefined && this.#document.selection.keys.has(key)
		}).length
		for (const input of this.#scope.querySelectorAll('input[type="checkbox"][data-table-page]'))
			if (
				input instanceof HTMLInputElement &&
				(input.closest('table') === null || input.closest('table') === this.#element)
			)
				this.#check(
					input,
					view.length > 0 && selected === view.length,
					selected > 0 && selected < view.length,
				)
	}

	#click(event: MouseEvent): void {
		if (!(event.target instanceof Element) || this.destroyed || this.#requesting) return
		const button = event.target.closest('button')
		if (
			!(button instanceof HTMLButtonElement) ||
			button.disabled ||
			button.closest('table') !== this.#element
		)
			return
		const outcome = attempt(() => {
			if (button.hasAttribute('data-table-sort') && this.#element.tHead?.contains(button)) {
				const column = button.getAttribute('data-table-sort')
				if (column === null || !this.#document.schema.columns.some((entry) => entry.key === column))
					throw new TableBindingError('STRUCTURE', 'The sort button names no column')
				const direction = this.#document.sort.order(column)?.direction
				const orders =
					direction === 'descending'
						? []
						: [
								{
									column,
									direction:
										direction === undefined ? ('ascending' as const) : ('descending' as const),
								},
							]
				const request = new CustomEvent('table-sort', { cancelable: true, detail: orders })
				this.#requesting = true
				this.#emitter.emit('sort', request)
				this.#requesting = false
				if (request.defaultPrevented || this.destroyed) return
				this.#document.sort.remove()
				if (!this.destroyed) this.#document.sort.set(orders)
			} else if (button.hasAttribute('data-table-expand')) {
				const row = button.closest('tr')
				const key = Array.from(this.#rows).find(([, node]) => node === row)?.[0]
				if (key !== undefined) this.#document.expansion.toggle(key)
			}
		})
		if (!outcome.success) this.#emitter.emit('error', outcome.error)
	}

	#change(event: Event): void {
		const input = event.target
		if (
			!(input instanceof HTMLInputElement) ||
			input.type !== 'checkbox' ||
			input.disabled ||
			this.destroyed
		)
			return
		const table = input.closest('table')
		if (table !== null && table !== this.#element) return
		const outcome = attempt(() => {
			if (input.hasAttribute('data-table-page')) {
				const keys = this.#keys(this.#document.view)
				if (input.checked) this.#document.selection.select(keys)
				else this.#document.selection.clear(keys)
			} else if (input.hasAttribute('data-table-select') && table === this.#element) {
				const key = Array.from(this.#rows).find(([, node]) => node === input.closest('tr'))?.[0]
				if (key !== undefined) {
					if (input.checked) this.#document.selection.select(key)
					else this.#document.selection.clear(key)
				}
			}
		})
		if (!outcome.success) this.#emitter.emit('error', outcome.error)
	}

	#keys(rows: readonly TableRow[]): readonly string[] {
		return rows.flatMap((row) => {
			const key = extractKey(this.#document.schema, row)
			return key === undefined ? [] : [key]
		})
	}
}
