import type { TableInterface } from '@src/core'
import type { TableBindingInterface, TableBindingOptions } from './types.js'
import { TableBinding } from './TableBinding.js'

/** Creates a native table binding with one retained row owner.
 * @param element - The native table to bind.
 * @param document - The borrowed core document.
 * @param options - Renderers, scoped controls, and listeners.
 * @returns The native binding.
 */
export function createTableBinding(
	element: HTMLTableElement,
	document: TableInterface,
	options?: TableBindingOptions,
): TableBindingInterface {
	return new TableBinding(element, document, options)
}
