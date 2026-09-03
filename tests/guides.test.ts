import { describe, expect, it } from 'vitest'
import {
	computeSymbolKey,
	createGuide,
	createSource,
	createSourceManager,
	extractFenceImports,
	findMissing,
	findMissingSymbols,
	findUnexampled,
	findUnlisted,
	isExternalLink,
	parseManifest,
	resolveLink,
} from '@orkestrel/guide'
import { readFileSync } from 'node:fs'
import { requireValue, resolveRoot } from '@orkestrel/test'
import { readInventory } from '@orkestrel/test/server'
import type {
	BetweenFilter,
	ChoiceColumn,
	FlagColumn,
	NumberColumn,
	TableKey,
	TableOrder,
	TableSchema,
	TextColumn,
} from '@src/core'
import {
	admitsFilter,
	auditTable,
	cloneRow,
	cloneSchema,
	compareCells,
	computeKeys,
	createTable,
	extractColumn,
	extractKey,
	filterRows,
	isColumnCell,
	isColumnChoice,
	isStructuralTableSchema,
	isTableCell,
	isTableColumn,
	isTableRow,
	isTableSchema,
	matchesCell,
	matchesFilter,
	matchesTerms,
	mergeTerms,
	parseRows,
	parseTable,
	removeTerms,
	serializeRows,
	serializeTable,
	sortRows,
	Table,
} from '@src/core'
import { compareTextNaturally, matchTextLoosely, readTableError } from './setup.js'

/** Every fence language this package's guides may use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({
	'@orkestrel/table': 'src/core',
	'@src/core': 'src/core',
})
/** Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings. */
const INTERNAL: readonly string[] = Object.freeze([
	'class ExpansionManager',
	'class FilterManager',
	'class KeyManager',
	'class PaginationManager',
	'class RowManager',
	'class SelectionManager',
	'class SortManager',
])
/** Root-level files this package's guides link to. */
const ROOT_FILES = Object.freeze(['AGENTS.md', 'README.md'])

const root = resolveRoot(import.meta)
const files: Record<string, string> = {
	...readInventory(root, ['src', 'guides', 'tests'], { extensions: ['.ts', '.md'] }),
}
for (const name of ROOT_FILES) files[name] = readFileSync(new URL(name, root), 'utf8')
const manifest = parseManifest(
	requireValue(files['guides/README.md'], 'Missing file: guides/README.md'),
	'guides',
)
const sources = createSourceManager({ files, modules: MODULES })
const readme = createGuide(requireValue(files['README.md'], 'Missing file: README.md'))

it('imports only real exports in every root README ```ts fence', () => {
	const fences = readme.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
	for (const fence of fences) {
		for (const { specifier, names } of extractFenceImports(fence.code)) {
			const imported = sources.source(specifier)
			if (imported === undefined) continue
			const surface = imported.surface().map((symbol) => symbol.name)
			expect(findMissing(names, surface)).toEqual([])
		}
	}
})

it('parses manifest rows that point at real files', () => {
	expect(manifest.length).toBeGreaterThan(0)
	for (const entry of manifest) {
		expect(files[entry.spec]).toBeDefined()
		const modules = typeof entry.source === 'string' ? [entry.source] : entry.source
		for (const module of modules) {
			expect(Object.keys(files).some((path) => path.startsWith(`${module}/`))).toBe(true)
		}
		expect(Object.keys(files).some((path) => path.startsWith(`${entry.tests}/`))).toBe(true)
	}
})

for (const entry of manifest) {
	const guide = createGuide(requireValue(files[entry.spec], `Missing file: ${entry.spec}`))
	const source = createSource({ files, module: entry.source })

	describe(`${entry.concept}`, () => {
		it('uses only listed fence languages', () => {
			expect(findUnlisted(guide.fences(), FENCE_LANGUAGES)).toEqual([])
		})

		it('extracts a non-empty documented surface', () => {
			expect(guide.surface().length).toBeGreaterThan(0)
		})
		it('re-exports every direct declaration that is not named internal', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(stranded.filter((key) => !INTERNAL.includes(key))).toEqual([])
		})
		it('names no symbol internal that the barrel already exports', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(INTERNAL.filter((key) => !stranded.includes(key))).toEqual([])
		})
		it('re-exports only direct declarations', () => {
			expect(findMissingSymbols(source.surface(), source.exports())).toEqual([])
		})
		it('documents every barrel export', () => {
			expect(findMissingSymbols(source.surface(), guide.surface())).toEqual([])
		})
		it('documents only barrel exports', () => {
			expect(findMissingSymbols(guide.surface(), source.surface())).toEqual([])
		})

		it('exposes no hidden module-scope declarations', () => {
			expect(source.hidden().map(computeSymbolKey)).toEqual([])
		})

		for (const group of guide.methods()) {
			const members = source.methods(group.interface)
			const entity = group.interface.replace(/Interface$/u, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, group.methods)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(group.methods, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface ? [] : findMissing(source.methods(entity), group.methods)
					expect(extra).toEqual([])
				})
			})
		}

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.kind === 'function')
				.map((symbol) => symbol.name)
			expect(findUnexampled(names, fences, source.examples())).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/u, '')
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					const examples =
						entity === group.interface
							? source.examples(group.interface)
							: source.examples(group.interface).concat(source.examples(entity))
					expect(findUnexampled(group.methods, fences, examples)).toEqual([])
				})
			})
		}

		it('imports only real exports in every ```ts fence', () => {
			const fences = guide.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
			for (const fence of fences) {
				for (const { specifier, names } of extractFenceImports(fence.code)) {
					const imported = sources.source(specifier)
					if (imported === undefined) continue
					const surface = imported.surface().map((symbol) => symbol.name)
					expect(findMissing(names, surface)).toEqual([])
				}
			}
		})

		it('resolves every relative link', () => {
			const broken = guide
				.links()
				.filter((href) => !isExternalLink(href))
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(broken).toEqual([])
		})
		it('links only to test files that exist', () => {
			const missing = guide
				.tests()
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(missing).toEqual([])
		})
	})
}

// Each following test transcribes one runnable fence and asserts every value its comments claim.
describe('table.md fences', () => {
	it('opens the Surface example', () => {
		const table = createTable(
			{
				label: 'People',
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id', label: 'Reference' },
					{ cell: 'text', key: 'name', label: 'Name' },
					{ cell: 'number', key: 'age', label: 'Age' },
				],
			},
			{
				rows: [
					{ id: '1', name: 'Ada', age: 36 },
					{ id: '2', name: 'Grace', age: 45 },
					{ id: '3', name: 'Alan', age: 41 },
				],
				limit: 2,
			},
		)

		table.filter.set({ column: 'name', operator: 'contains', text: 'a' })
		table.sort.set({ column: 'age', direction: 'descending' })

		expect(table.count).toBe(3)
		expect(table.pagination.count).toBe(2)
		expect(table.view.map((row) => row.name)).toStrictEqual(['Grace', 'Alan'])
	})

	it('declares a text column', () => {
		const name: TextColumn = { cell: 'text', key: 'name', label: 'Name' }
		expect(name).toStrictEqual({ cell: 'text', key: 'name', label: 'Name' })
	})

	it('declares a number column', () => {
		const age: NumberColumn = { cell: 'number', key: 'age', label: 'Age' }
		expect(age).toStrictEqual({ cell: 'number', key: 'age', label: 'Age' })
	})

	it('declares a flag column', () => {
		const active: FlagColumn = { cell: 'flag', key: 'active', label: 'Active' }
		expect(active).toStrictEqual({ cell: 'flag', key: 'active', label: 'Active' })
	})

	it('declares an ordered choice column', () => {
		const status: ChoiceColumn = {
			cell: 'choice',
			key: 'status',
			label: 'Status',
			choices: [
				{ value: 'draft', label: 'Draft' },
				{ value: 'live', label: 'Live' },
				{ value: 'archived', label: 'Archived', help: 'Kept, not shown' },
			],
		}
		expect(status.choices.map((choice) => choice.value)).toStrictEqual([
			'draft',
			'live',
			'archived',
		])
	})

	it('compares choice, text, and flag cells', () => {
		const status: ChoiceColumn = {
			cell: 'choice',
			key: 'status',
			choices: [
				{ value: 'draft', label: 'Draft' },
				{ value: 'live', label: 'Live' },
			],
		}

		expect(compareCells(status, 'draft', 'live')).toBeLessThan(0)
		expect(compareCells({ cell: 'text', key: 'name' }, 'draft', 'live')).toBeLessThan(0)
		expect(compareCells({ cell: 'flag', key: 'ok' }, false, true)).toBeLessThan(0)
	})

	it('matches an ISO text range lexically', () => {
		const when: TextColumn = { cell: 'text', key: 'when', label: 'Signed up' }
		const range: BetweenFilter = {
			column: 'when',
			operator: 'between',
			minimum: '2026-01-01',
			maximum: '2026-06-30',
		}

		expect(matchesFilter(when, '2026-03-14', range)).toBe(true)
		expect(matchesFilter(when, '2025-12-31', range)).toBe(false)
	})

	it('reads a column and gates its cells', () => {
		const schema: TableSchema = {
			key: 'id',
			columns: [
				{ cell: 'text', key: 'id' },
				{ cell: 'number', key: 'age' },
			],
		}

		expect(extractColumn(schema, 'age')?.cell).toBe('number')
		expect(extractColumn(schema, 'colour')).toBeUndefined()
		expect(matchesCell({ cell: 'number', key: 'age' }, 36)).toBe(true)
		expect(matchesCell({ cell: 'number', key: 'age' }, '36')).toBe(false)
		expect(matchesCell({ cell: 'number', key: 'age' }, Number.NaN)).toBe(false)
		expect(
			matchesCell(
				{
					cell: 'choice',
					key: 'status',
					choices: [{ value: 'live', label: 'Live' }],
				},
				'draft',
			),
		).toBe(false)
	})

	it('overrides one column matcher', () => {
		const table = createTable(
			{
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'text', key: 'name' },
				],
			},
			{
				rows: [{ id: '1', name: 'ada' }],
				comparators: { name: compareTextNaturally },
				matchers: { name: matchTextLoosely },
			},
		)

		table.filter.set({ column: 'name', operator: 'contains', text: 'ADA' })
		expect(table.count).toBe(1)
	})

	it('refuses duplicate and absent identities atomically', () => {
		const table = createTable({
			key: 'id',
			columns: [
				{ cell: 'text', key: 'id' },
				{ cell: 'text', key: 'name' },
			],
		})
		table.rows.add({ id: '7', name: 'Ada' })

		expect(readTableError(() => table.rows.add({ id: '7', name: 'Grace' }))).toBe('KEY')
		expect(readTableError(() => table.rows.add({ name: 'Alan' }))).toBe('KEY')
		expect(table.rows.rows().length).toBe(1)
	})

	it('merges an update without moving identity', () => {
		const table = createTable(
			{
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'text', key: 'name' },
					{ cell: 'number', key: 'age' },
				],
			},
			{ rows: [{ id: '1', name: 'Ada', age: 36 }] },
		)

		expect(table.rows.update({ id: '1', age: 37 })).toBe(true)
		expect(table.rows.row('1')).toStrictEqual({ id: '1', name: 'Ada', age: 37 })
		expect(table.rows.update({ id: '9', name: 'Nobody' })).toBe(false)
		expect(table.rows.rows().length).toBe(1)
	})

	it('extracts only usable identities', () => {
		const schema: TableSchema = { key: 'id', columns: [{ cell: 'text', key: 'id' }] }
		expect(extractKey(schema, { id: '7' })).toBe('7')
		expect(extractKey(schema, { id: '' })).toBeUndefined()
		expect(extractKey(schema, { name: 'Ada' })).toBeUndefined()
	})

	it('sorts by ordered terms', () => {
		const table = createTable(
			{
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'text', key: 'team' },
					{ cell: 'number', key: 'age' },
				],
			},
			{
				rows: [
					{ id: '1', team: 'blue', age: 40 },
					{ id: '2', team: 'red', age: 30 },
					{ id: '3', team: 'blue', age: 30 },
				],
			},
		)

		table.sort.set([
			{ column: 'team', direction: 'ascending' },
			{ column: 'age', direction: 'descending' },
		])
		expect(table.view.map((row) => row.id)).toStrictEqual(['1', '3', '2'])
		expect(table.sort.order('age')).toStrictEqual({
			column: 'age',
			direction: 'descending',
		})
	})

	it('merges, compares, and removes lens terms', () => {
		const current: readonly TableOrder[] = [
			{ column: 'team', direction: 'ascending' },
			{ column: 'age', direction: 'descending' },
		]
		const next = mergeTerms(current, [{ column: 'age', direction: 'ascending' }])

		expect(next.map((order) => order.column)).toStrictEqual(['team', 'age'])
		expect(matchesTerms(next, current, (order, other) => order.direction === other.direction)).toBe(
			false,
		)
		expect(removeTerms(next, ['team']).map((order) => order.column)).toStrictEqual(['age'])
	})

	it('sorts rows without moving the input', () => {
		const schema: TableSchema = {
			key: 'id',
			columns: [
				{ cell: 'text', key: 'id' },
				{ cell: 'number', key: 'age' },
			],
		}
		const rows = [{ id: '1', age: 40 }, { id: '2' }, { id: '3', age: 30 }]

		expect(
			sortRows(schema, rows, [{ column: 'age', direction: 'ascending' }]).map((row) => row.id),
		).toStrictEqual(['2', '3', '1'])
		expect(sortRows(schema, rows, []).map((row) => row.id)).toStrictEqual(['1', '2', '3'])
		expect(rows.map((row) => row.id)).toStrictEqual(['1', '2', '3'])
	})

	it('filters with and-only composition', () => {
		const table = createTable(
			{
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'text', key: 'name' },
					{ cell: 'number', key: 'age' },
				],
			},
			{
				rows: [
					{ id: '1', name: 'Ada', age: 36 },
					{ id: '2', name: 'Grace', age: 45 },
				],
			},
		)

		table.filter.set([
			{ column: 'name', operator: 'contains', text: 'a' },
			{ column: 'age', operator: 'between', minimum: 40, maximum: 50 },
		])
		expect(table.count).toBe(1)
		expect(table.view.map((row) => row.name)).toStrictEqual(['Grace'])
		expect(
			readTableError(() => table.filter.set({ column: 'age', operator: 'contains', text: '4' })),
		).toBe('CELL')
	})

	it('filters rows case-sensitively in input order', () => {
		const schema: TableSchema = {
			key: 'id',
			columns: [
				{ cell: 'text', key: 'id' },
				{ cell: 'text', key: 'name' },
			],
		}
		const rows = [
			{ id: '1', name: 'Ada' },
			{ id: '2', name: 'Grace' },
			{ id: '3', name: 'Bob' },
		]
		const lower = filterRows(schema, rows, [{ column: 'name', operator: 'contains', text: 'a' }])
		const upper = filterRows(schema, rows, [{ column: 'name', operator: 'contains', text: 'A' }])

		expect(lower.map((row) => row.name)).toStrictEqual(['Ada', 'Grace'])
		expect(upper.map((row) => row.name)).toStrictEqual(['Ada'])
		expect(filterRows(schema, rows, []).length).toBe(3)
	})

	it('clamps and removes pagination', () => {
		const table = createTable(
			{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
			{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }], limit: 2 },
		)

		expect(table.pagination.count).toBe(3)
		table.pagination.move(9)
		expect(table.pagination.page).toBe(3)
		expect(table.pagination.offset).toBe(4)
		expect(table.view.map((row) => row.id)).toStrictEqual(['5'])
		table.pagination.resize()
		expect(table.pagination.limit).toBeUndefined()
		expect(table.view.length).toBe(5)
	})

	it('selects visible keys and prunes removed rows', () => {
		const table = createTable(
			{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
			{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
		)

		table.selection.select(table.view.map((row) => String(row.id)))
		expect(table.selection.keys.size).toBe(3)
		table.selection.toggle('2')
		expect(table.selection.keys.has('2')).toBe(false)
		table.rows.remove('1')
		expect(table.selection.keys.has('1')).toBe(false)
	})

	it('expands every row and refuses an invalid batch atomically', () => {
		const table = createTable(
			{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
			{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
		)

		table.expansion.expand()
		expect(table.expansion.keys.size).toBe(3)
		table.expansion.clear('2')
		expect(table.expansion.expand(['2', '9'])).toBe(false)
		expect(table.expansion.keys.has('2')).toBe(false)
		table.expansion.toggle('2')
		expect(table.expansion.keys.size).toBe(3)
	})

	it('clears for reuse and destroys idempotently', () => {
		const table = createTable(
			{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
			{ rows: [{ id: '1' }, { id: '2' }] },
		)

		table.clear()
		expect(table.count).toBe(0)
		table.rows.add({ id: '3' })
		table.destroy()
		table.destroy()
		expect(table.destroyed).toBe(true)
		expect(table.count).toBe(1)
		expect(readTableError(() => table.rows.add({ id: '4' }))).toBe('DESTROYED')
	})

	it('announces only committed moves', () => {
		const seen: string[] = []
		const table = createTable(
			{
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'number', key: 'age' },
				],
			},
			{
				rows: [{ id: '1', age: 36 }],
				on: {
					write: (key) => seen.push(`write ${key}`),
					sort: (orders) => seen.push(`sort ${orders.length}`),
				},
			},
		)
		table.emitter.on('clear', () => seen.push('clear'))

		table.rows.add({ id: '2', age: 45 })
		table.sort.set({ column: 'age', direction: 'ascending' })
		table.sort.set({ column: 'age', direction: 'ascending' })
		table.clear()

		expect(seen).toStrictEqual(['write 2', 'sort 1', 'clear'])
	})

	it('round-trips a schema through JSON exactly', () => {
		const schema: TableSchema = {
			name: 'people',
			label: 'People',
			key: 'id',
			columns: [
				{ cell: 'text', key: 'id', label: 'Reference' },
				{ cell: 'number', key: 'age', label: 'Age', meta: { align: 'right' } },
			],
		}
		const wire = JSON.stringify(serializeTable(schema))
		const received = parseTable(JSON.parse(wire))

		expect(JSON.stringify(serializeTable(received ?? schema))).toBe(wire)
		expect(parseTable({ key: 'id', columns: 'not a list' })).toBeUndefined()
		expect(parseTable({ columns: [{ cell: 'text', key: 'id' }] })).toBeUndefined()
	})

	it('coerces and serializes rows at the wire boundary', () => {
		const schema: TableSchema = {
			key: 'id',
			columns: [
				{ cell: 'text', key: 'id' },
				{ cell: 'number', key: 'age' },
				{ cell: 'flag', key: 'active' },
			],
		}

		expect(parseRows(schema, [{ id: '1', age: '36', active: 'true' }])).toStrictEqual([
			{ id: '1', age: 36, active: true },
		])
		expect(parseRows(schema, [{ id: '1', age: 'old' }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1' }, { id: '1' }])).toBeUndefined()
		expect(parseRows(schema, [{ id: '1', colour: 'red' }])).toBeUndefined()
		expect(serializeRows(schema, [{ age: 36, id: '1' }])).toEqual([{ id: '1', age: 36 }])
	})

	it('answers every guard example', () => {
		expect(isColumnCell('choice')).toBe(true)
		expect(isColumnCell('date')).toBe(false)
		expect(isTableCell(36)).toBe(true)
		expect(isTableCell(null)).toBe(false)
		expect(isTableRow({ id: '1', age: 36 })).toBe(true)
		expect(isTableRow({ id: ['1'] })).toBe(false)
		expect(isColumnChoice({ value: 'a', label: 'A' })).toBe(true)
		expect(isColumnChoice({ value: 'a', label: 'A', colour: 'red' })).toBe(false)
		expect(isTableColumn({ cell: 'choice', key: 'status', choices: [] })).toBe(true)
		expect(isTableSchema({ key: 'id', columns: [{ cell: 'text', key: 'id' }] })).toBe(true)
		expect(isTableSchema({ columns: [] })).toBe(false)
	})

	it('owns every clone the guide shows', () => {
		const row = { id: '1', age: 36 }
		const owned = cloneRow(row)

		expect(owned === row).toBe(false)
		expect(Object.isFrozen(owned)).toBe(true)
		expect(
			Object.isFrozen(cloneSchema({ key: 'id', columns: [{ cell: 'text', key: 'id' }] })),
		).toBe(true)
	})

	it('reports the audit diagnostics the guide quotes', () => {
		expect(auditTable({ key: 'ref', columns: [{ cell: 'text', key: 'id' }] })).toStrictEqual([
			'schema key "ref" names no declared column',
		])
		expect(auditTable({ key: 'age', columns: [{ cell: 'number', key: 'age' }] })).toStrictEqual([
			'schema key "age" names a number column, which holds no identity',
		])
		expect(
			auditTable({
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'text', key: 'id' },
				],
			}),
		).toStrictEqual(['column "id" is declared more than once'])
		expect(auditTable({ key: 'id', columns: [{ cell: 'text', key: 'id' }] })).toStrictEqual([])
	})

	it('codes each refusal named by the errors table', () => {
		expect(
			readTableError(() => createTable({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })),
		).toBe('SCHEMA')
		const table = createTable({
			key: 'id',
			columns: [
				{ cell: 'text', key: 'id' },
				{ cell: 'number', key: 'age' },
			],
		})

		expect(readTableError(() => table.sort.set({ column: 'nope', direction: 'ascending' }))).toBe(
			'COLUMN',
		)
		expect(readTableError(() => table.rows.add({ id: '1', age: 'twelve' }))).toBe('CELL')
		expect(table.rows.rows().length).toBe(0)
	})

	it('constructs the class like the factory', () => {
		const table = new Table(
			{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
			{ rows: [{ id: '1' }] },
		)
		expect(table.count).toBe(1)
	})

	it('admits a filter only when the operator and operand fit the column', () => {
		const age: NumberColumn = { cell: 'number', key: 'age', label: 'Age' }

		expect(
			admitsFilter(age, { column: 'age', operator: 'between', minimum: 30, maximum: 40 }),
		).toBe(true)
		expect(admitsFilter(age, { column: 'age', operator: 'contains', text: '3' })).toBe(false)
		expect(admitsFilter(age, { column: 'age', operator: 'equals', value: '36' })).toBe(false)
		expect(admitsFilter(age, { column: 'name', operator: 'equals', value: 36 })).toBe(false)
	})

	it('computes one atomic membership change over a key set', () => {
		const known: readonly TableKey[] = ['1', '2', '3']
		const picked: ReadonlySet<TableKey> = new Set(['1'])

		expect(computeKeys(known, picked, '2', () => true)?.size).toBe(2)
		expect(computeKeys(known, picked, '9', () => true)).toBeUndefined()
		expect(computeKeys(known, picked, '1', () => true) === picked).toBe(true)
		expect(computeKeys(known, picked, undefined, (included) => !included)?.size).toBe(2)
	})

	it('draws the shape and audit boundary between the schema guards', () => {
		const unsound = { key: 'missing', columns: [{ cell: 'text', key: 'id' }] }

		expect(isStructuralTableSchema(unsound)).toBe(true)
		expect(isTableSchema(unsound)).toBe(false)
		expect(parseTable(unsound)).toBeUndefined()
		expect(isStructuralTableSchema({ columns: [] })).toBe(false)
	})
})

describe('README.md Usage fence', () => {
	it('executes the value claims in its comments', () => {
		const picked: number[] = []
		const table = createTable(
			{
				label: 'People',
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id', label: 'Reference' },
					{ cell: 'text', key: 'name', label: 'Name' },
					{ cell: 'number', key: 'age', label: 'Age' },
					{
						cell: 'choice',
						key: 'status',
						label: 'Status',
						choices: [
							{ value: 'draft', label: 'Draft' },
							{ value: 'live', label: 'Live' },
						],
					},
				],
			},
			{
				rows: [
					{ id: '1', name: 'Ada', age: 36, status: 'live' },
					{ id: '2', name: 'Grace', age: 45, status: 'draft' },
					{ id: '3', name: 'Alan', age: 41, status: 'live' },
				],
				limit: 2,
				on: { select: (keys) => picked.push(keys.size) },
			},
		)

		table.filter.set({ column: 'status', operator: 'equals', value: 'live' })
		table.sort.set({ column: 'age', direction: 'descending' })
		expect(table.count).toBe(2)
		expect(table.view.map((row) => row.name)).toStrictEqual(['Alan', 'Ada'])
		table.selection.toggle('1')
		expect(table.selection.keys.has('1')).toBe(true)
		expect(picked).toStrictEqual([1])
	})
})
