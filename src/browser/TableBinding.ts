import type { EmitterInterface } from '@orkestrel/emitter'
import type { GridInterface, GridRow } from '@src/core'
import type {
	TableBindingEventMap,
	TableBindingInterface,
	TableBindingOptions,
	GridExpansion,
	GridRange,
} from './types.js'
import { attempt, parseNumber } from '@orkestrel/contract'
import { Emitter } from '@orkestrel/emitter'
import { extractGridKey, matchesGridRow } from '@src/core'
import { TableBindingError } from './errors.js'
import { readTableRows, readTableSchema } from './helpers.js'

/** Retains keyed native rows while projecting every core grid manager. */
export class TableBinding implements TableBindingInterface {
	readonly #element: HTMLTableElement
	readonly #document: GridInterface
	readonly #options: TableBindingOptions
	readonly #body: HTMLTableSectionElement
	readonly #scope: HTMLElement
	readonly #emitter: Emitter<TableBindingEventMap>
	readonly #lifetime = new AbortController()
	readonly #observer: MutationObserver
	readonly #rows = new Map<string, HTMLTableRowElement>()
	readonly #values = new Map<string, GridRow>()
	readonly #details = new Map<string, HTMLTableRowElement>()
	readonly #detailValues = new Map<string, GridRow>()
	readonly #visible = new Set<HTMLTableRowElement>()
	readonly #attributes = new Map<
		Element,
		Map<string, { readonly original: string | null; value: string | null }>
	>()
	readonly #checks = new Map<
		HTMLInputElement,
		{ readonly checked: boolean; readonly indeterminate: boolean; value: boolean; mixed: boolean }
	>()
	readonly #controlValues = new Map<
		HTMLSelectElement | HTMLOutputElement,
		{ readonly original: string; value: string }
	>()
	readonly #schedule = this.#enqueue.bind(this)
	readonly #subscriptions: Array<() => void> = []
	#pending: ReturnType<typeof setTimeout> | undefined
	#announcement: ReturnType<typeof setTimeout> | undefined
	#range: string | undefined
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
		document: GridInterface,
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
					const key = extractGridKey(document.schema, row)
					return key === undefined || !matchesGridRow(document.rows.row(key), row)
				})
			)
				throw new TableBindingError('STRUCTURE', 'Authored rows must match the supplied document')
			for (const [index, row] of rows.entries()) {
				const key = extractGridKey(document.schema, row)
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
		this.#scope.addEventListener('click', (event) => this.#click(event), {
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
	get document(): GridInterface {
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
		if (this.#announcement !== undefined) clearTimeout(this.#announcement)
		this.#announcement = undefined
		for (const unsubscribe of this.#subscriptions) unsubscribe()
		this.#subscriptions.length = 0
		for (const detail of this.#details.values()) detail.remove()
		if (this.#options.row === undefined) {
			for (const row of this.#document.rows.rows()) {
				const key = extractGridKey(this.#document.schema, row)
				const node = key === undefined ? undefined : this.#rows.get(key)
				if (node !== undefined) this.#place(node, null)
			}
		}
		for (const element of this.#attributes.keys()) this.#release(element)
		for (const input of this.#checks.keys()) this.#release(input)
		for (const [control, state] of this.#controlValues)
			if (control.value === state.value) control.value = state.original
		this.#restoreFocus(focused)
		this.#rows.clear()
		this.#values.clear()
		this.#details.clear()
		this.#detailValues.clear()
		this.#attributes.clear()
		this.#checks.clear()
		this.#controlValues.clear()
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
		const additions: GridRow[] = []
		const replacements: GridRow[] = []
		for (const row of rows) {
			const key = extractGridKey(this.#document.schema, row)
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
			const key = extractGridKey(this.#document.schema, row)
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
			const key = extractGridKey(this.#document.schema, row)
			if (key === undefined) continue
			const node = this.#rows.get(key) ?? this.#createRow(key)
			if (this.#options.row !== undefined && !matchesGridRow(this.#values.get(key), row)) {
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
		if (this.destroyed) return
		this.#pages(view)
		if (this.destroyed) return
		this.#pager()
		if (this.destroyed) return
		this.#restoreFocus(focused, true)
		this.#observe()
		if (this.#records.length > 0) this.#enqueue()
	}

	#createRow(key: string): HTMLTableRowElement {
		if (this.#options.row === undefined)
			throw new TableBindingError('STRUCTURE', 'An authored document row has no native row')
		const node = this.#element.ownerDocument.createElement('tr')
		node.setAttribute('data-table-key', key)
		this.#rows.set(key, node)
		return node
	}

	#createDetail(key: string): HTMLTableRowElement {
		const detail = this.#element.ownerDocument.createElement('tr')
		detail.id = `table-detail-${crypto.randomUUID()}`
		detail.insertCell().colSpan = Math.max(
			1,
			this.#rows.get(key)?.cells.length ?? this.#document.schema.columns.length,
		)
		this.#details.set(key, detail)
		return detail
	}

	#restoreFocus(focused: HTMLElement | undefined, hidden = false): void {
		if (
			focused !== undefined &&
			this.#element.ownerDocument.activeElement !== focused &&
			(this.#element.ownerDocument.activeElement === this.#element.ownerDocument.body ||
				this.#element.ownerDocument.activeElement === null)
		) {
			if (focused.isConnected) focused.focus({ preventScroll: true })
			else if (hidden) this.#focusTable()
		}
	}

	#focusTable(): void {
		this.#attribute(this.#element, 'tabindex', '-1')
		if (
			!this.#element.hasAttribute('aria-label') &&
			!this.#element.hasAttribute('aria-labelledby') &&
			this.#element.caption === null
		)
			this.#attribute(this.#element, 'aria-label', this.#document.schema.label ?? 'Table')
		this.#element.focus({ preventScroll: true })
	}

	#detail(key: string, row: GridRow): HTMLTableRowElement | undefined {
		if (this.#options.detail === undefined || !this.#document.expansion.keys.has(key))
			return undefined
		const detail = this.#details.get(key) ?? this.#createDetail(key)
		if (!matchesGridRow(this.#detailValues.get(key), row)) {
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
		if (!this.#attributes.has(element)) this.#attributes.set(element, new Map())
		const attributes = this.#attributes.get(element)
		if (attributes === undefined) return
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
		for (const button of node.querySelectorAll(
			'button[data-table-expand]:not([data-table-expand="page"])',
		))
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
			const description =
				order === undefined
					? null
					: (this.#options.describe?.sort?.({
							column: order.column,
							direction: order.direction,
							priority: index + 1,
							count: orders.length,
						}) ?? `Sort priority ${index + 1} of ${orders.length}, ${order.direction}`)
			if (this.destroyed) return
			this.#attribute(
				header,
				'aria-sort',
				index === 0 && order !== undefined ? order.direction : null,
			)
			this.#attribute(button, 'aria-description', description)
		}
	}

	#pages(view: readonly GridRow[]): void {
		const keys = this.#keys(view)
		for (const button of this.#scoped('button[data-table-expand="page"]')) {
			this.#attribute(
				button,
				'aria-expanded',
				String(keys.length > 0 && keys.every((key) => this.#document.expansion.keys.has(key))),
			)
			if (button instanceof HTMLButtonElement) this.#disable(button, keys.length === 0)
			if (this.destroyed) return
		}
		const selected = view.filter((row) => {
			const key = extractGridKey(this.#document.schema, row)
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

	#scoped(selector: string): readonly HTMLElement[] {
		return Array.from(this.#scope.querySelectorAll<HTMLElement>(selector)).filter((control) => {
			const table = control.closest('table')
			return table === null || table === this.#element
		})
	}

	#disable(button: HTMLButtonElement, disabled: boolean, sibling?: HTMLButtonElement): void {
		if (disabled && this.#element.ownerDocument.activeElement === button) {
			if (sibling !== undefined) sibling.focus({ preventScroll: true })
			else this.#focusTable()
		}
		if (!this.destroyed) this.#attribute(button, 'disabled', disabled ? '' : null)
	}

	#value(control: HTMLSelectElement | HTMLOutputElement, value: string): void {
		const state = this.#controlValues.get(control)
		if (state === undefined) this.#controlValues.set(control, { original: control.value, value })
		else state.value = value
		if (control.value !== value) control.value = value
	}

	#readRange(): GridRange {
		const pagination = this.#document.pagination
		const length = this.#document.view.length
		return {
			first: length === 0 ? 0 : pagination.offset + 1,
			last: length === 0 ? 0 : pagination.offset + length,
			count: this.#document.count,
			page: pagination.page,
			pages: pagination.count,
			limit: pagination.limit,
		}
	}

	#pager(): void {
		const range = this.#readRange()
		const buttons = this.#scoped(
			'button[data-table-move="previous"], button[data-table-move="next"]',
		).filter((button) => button instanceof HTMLButtonElement)
		const enabled = buttons.filter((button) =>
			button.getAttribute('data-table-move') === 'previous'
				? range.page > 1
				: range.page < range.pages,
		)
		for (const button of enabled) this.#disable(button, false)
		for (const button of buttons) {
			if (!enabled.includes(button))
				this.#disable(
					button,
					true,
					enabled.find(
						(sibling) =>
							sibling.getAttribute('data-table-move') !== button.getAttribute('data-table-move'),
					),
				)
			if (this.destroyed) return
		}
		for (const select of this.#scoped('select[data-table-limit]'))
			if (select instanceof HTMLSelectElement)
				this.#value(select, range.limit === undefined ? '' : String(range.limit))
		const signature = JSON.stringify(range)
		if (signature === this.#range) return
		const outputs = this.#scoped('output[data-table-range]').filter(
			(output) => output instanceof HTMLOutputElement,
		)
		const description =
			this.#options.describe?.range?.(range) ?? `${range.first} to ${range.last} of ${range.count}`
		if (this.destroyed) return
		if (signature !== JSON.stringify(this.#readRange())) {
			this.#enqueue()
			return
		}
		this.#range = signature
		if (this.#announcement !== undefined) clearTimeout(this.#announcement)
		for (const output of outputs) this.#value(output, '')
		this.#announcement = setTimeout(() => {
			this.#announcement = undefined
			if (this.destroyed) return
			if (signature !== JSON.stringify(this.#readRange())) {
				this.#range = undefined
				this.#enqueue()
				return
			}
			for (const output of outputs)
				if (this.#scoped('output[data-table-range]').includes(output))
					this.#value(output, description)
		}, 0)
	}

	#click(event: MouseEvent): void {
		if (!(event.target instanceof Element) || this.destroyed || this.#requesting) return
		const button = event.target.closest('button')
		if (
			!(button instanceof HTMLButtonElement) ||
			button.disabled ||
			(button.closest('table') !== null && button.closest('table') !== this.#element)
		)
			return
		const outcome = attempt(() => {
			const move = button.getAttribute('data-table-move')
			if (move === 'previous' || move === 'next') {
				this.#document.pagination.move(
					this.#document.pagination.page + (move === 'previous' ? -1 : 1),
				)
			} else if (button.getAttribute('data-table-expand') === 'page') {
				const keys = this.#keys(this.#document.view)
				const closing =
					keys.length > 0 && keys.every((key) => this.#document.expansion.keys.has(key))
				const changing = keys.filter((key) => this.#document.expansion.keys.has(key) === closing)
				if (
					changing.length > 0 &&
					!this.#request(changing.map((key) => ({ key, expanded: !closing })))
				)
					return
				if (closing) this.#document.expansion.clear(keys)
				else this.#document.expansion.expand(keys)
			} else if (button.hasAttribute('data-table-sort') && this.#element.tHead?.contains(button)) {
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
				if (key === undefined) return
				const expanded = !this.#document.expansion.keys.has(key)
				if (!this.#request([{ key, expanded }])) return
				if (expanded) this.#document.expansion.expand(key)
				else this.#document.expansion.clear(key)
			}
		})
		if (!outcome.success) this.#emitter.emit('error', outcome.error)
	}

	#request(detail: readonly GridExpansion[]): boolean {
		const request = new CustomEvent('table-expand', { cancelable: true, detail })
		this.#requesting = true
		this.#emitter.emit('expand', request)
		this.#requesting = false
		return !request.defaultPrevented && !this.destroyed
	}

	#change(event: Event): void {
		const input = event.target
		if (input instanceof HTMLSelectElement && input.hasAttribute('data-table-limit')) {
			if (
				input.disabled ||
				this.destroyed ||
				!this.#scoped('select[data-table-limit]').includes(input)
			)
				return
			const outcome = attempt(() => {
				const limit = input.value === '' ? undefined : parseNumber(input.value)
				if (input.value !== '' && (limit === undefined || limit <= 0 || !Number.isInteger(limit)))
					throw new TableBindingError(
						'STRUCTURE',
						'The page limit must be a positive integer or empty',
					)
				this.#document.pagination.resize(limit)
			})
			if (!outcome.success) this.#emitter.emit('error', outcome.error)
			return
		}
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

	#keys(rows: readonly GridRow[]): readonly string[] {
		return rows.flatMap((row) => {
			const key = extractGridKey(this.#document.schema, row)
			return key === undefined ? [] : [key]
		})
	}
}
