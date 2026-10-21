import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type {
	TableDirection,
	TableInterface,
	TableKey,
	TableOrder,
	TableRow,
	TableSchema,
} from '@src/core'

/** Holds a validated native table projection for constructing a core document. */
export interface TableProjection {
	readonly schema: TableSchema
	readonly rows: readonly TableRow[]
}

/** Patches the contents of a retained row without moving or replacing that row.
 * @param element - The binding-owned row; a detail row already contains its spanning cell.
 * @param row - The core value to present.
 */
export type TableRenderHandler = (element: HTMLTableRowElement, row: TableRow) => void

/** Describes the displayed page within the filtered rows. */
export interface TableRange {
	readonly first: number
	readonly last: number
	readonly count: number
	readonly page: number
	readonly pages: number
	readonly limit: number | undefined
}

/** Describes a column's direction and one-based priority among active sort orders. */
export interface TableSortDescription {
	readonly column: string
	readonly direction: TableDirection
	readonly priority: number
	readonly count: number
}

/** Names a native binding failure at its structure, rendering, or lifecycle boundary. */
export type TableBindingErrorCode = 'STRUCTURE'

/** Proposes one row's next expansion state in a cancelable expand request. */
export interface TableExpansion {
	readonly key: TableKey
	readonly expanded: boolean
}

/** Announces cancelable sorting and expanding, completed rendering, and failed DOM operations. */
export type TableBindingEventMap = {
	readonly sort: readonly [event: CustomEvent<readonly TableOrder[]>]
	readonly expand: readonly [event: CustomEvent<readonly TableExpansion[]>]
	readonly render: readonly []
	readonly error: readonly [error: unknown]
}

/** Configures row ownership, detail presentation, scoped controls, and event listeners.
 * @remarks
 * Supply row for model-owned values and an empty body. Omit it to enhance authored rows
 * matching the supplied document. Each callback patches only the supplied row contents.
 * Detail receives a generated row containing a spanning cell. Scope contains the table and
 * its external controls. Describe customizes range and sort wording; range receives zero
 * bounds for an empty view, and sort receives a one-based priority and active order count.
 * The error option handles listener throws; on.error observes
 * failed native reads and renders. Neither callback owns row placement or core teardown.
 */
export interface TableBindingOptions {
	readonly row?: TableRenderHandler
	readonly detail?: TableRenderHandler
	readonly scope?: HTMLElement
	readonly describe?: {
		readonly range?: (range: TableRange) => string
		readonly sort?: (sort: TableSortDescription) => string
	}
	readonly on?: EmitterHooks<TableBindingEventMap>
	readonly error?: EmitterErrorHandler
}

/** Binds native table elements to a borrowed core document. */
export interface TableBindingInterface {
	readonly element: HTMLTableElement
	readonly document: TableInterface
	readonly destroyed: boolean
	readonly emitter: EmitterInterface<TableBindingEventMap>
	/** Reconciles and renders the document, retrying a failed renderer. */
	refresh(): void
	/** Releases listeners and restores owned attributes without destroying the document. */
	destroy(): void
}
