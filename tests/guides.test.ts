// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
// package's own, as is the executed section that closes the file.

import { GuideCommand } from '@orkestrel/guide/server'
import { readInventory } from '@orkestrel/test/server'
import { createVitest } from 'vitest/node'
import type {
	BetweenFilter,
	ChoiceColumn,
	FlagColumn,
	NumberColumn,
	GridKey,
	GridOrder,
	GridSchema,
	TextColumn,
} from '@src/core'

/** Every fence language this package's guides may use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
const PACKAGE_NAME = '@orkestrel/table'
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/table.md'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({
	[PACKAGE_NAME]: 'src/core',
	'@src/core': 'src/core',
	'@orkestrel/table/browser': 'src/browser',
	'@src/browser': 'src/browser',
})
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the assertion that follows it fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([
	'class ExpansionManager',
	'class FilterManager',
	'class KeyManager',
	'class PaginationManager',
	'class RowManager',
	'class SelectionManager',
	'class SortManager',
])
await new GuideCommand({
	root: new URL('../', import.meta.url),
	patterns: ['src/**/*.ts', 'tests/**/*.ts', 'guides/*.md', '*.md', 'package.json'],
	modules: MODULES,
	languages: FENCE_LANGUAGES,
	language: EXAMPLE_LANGUAGE,
	reader: readInventory,
	runner: createVitest,
}).execute(async ({ files, report, rows: entries }) => {
	const { isRecord, parseJSON } = await import('@orkestrel/contract')
	const {
		computeSymbolKey,
		createGuide,
		createSourceManager,
		extractFenceImports,
		findMissing,
		findMissingSymbols,
		findUnexampled,
		isExternalLink,
		resolveLink,
	} = await import('@orkestrel/guide')
	const { requireValue } = await import('@orkestrel/test')
	const {
		admitsFilter,
		auditGrid,
		cloneRow,
		cloneGridSchema,
		compareCells,
		computeKeys,
		createGrid,
		extractColumn,
		extractGridKey,
		filterGridRows,
		isColumnCell,
		isColumnChoice,
		isStructuralGridSchema,
		isGridCell,
		isGridColumn,
		isGridRow,
		isGridSchema,
		matchesCell,
		matchesFilter,
		matchesTerms,
		mergeTerms,
		parseRows,
		parseGrid,
		removeTerms,
		serializeRows,
		serializeGrid,
		sortGridRows,
		Grid,
	} = await import('@src/core')
	const { compareTextNaturally, matchTextLoosely, readGridError } = await import('./setup.js')
	const { describe, expect, it } = await import('vitest')
	const own = requireValue(
		entries.find((row) => row.entry.spec === GUIDE_SPEC),
		`Missing manifest row: ${GUIDE_SPEC}`,
	)
	const manifest = parseJSON(requireValue(files['package.json'], 'Missing inventory: package.json'))
	if (!isRecord(manifest)) throw new Error('Invalid package manifest: package.json')
	const sources = createSourceManager({ files, modules: MODULES })
	it('executes the whole-row replacement guide without losing selection', () => {
		const grid = createGrid(
			{
				key: 'id',
				columns: [
					{ key: 'id', cell: 'text' },
					{ key: 'name', cell: 'text' },
				],
			},
			{ rows: [{ id: 'ash', name: 'Ash' }] },
		)
		grid.selection.select('ash')
		expect(grid.rows.replace({ id: 'ash' })).toBe(true)
		expect(grid.rows.row('ash')).toEqual({ id: 'ash' })
		expect(grid.selection.keys.has('ash')).toBe(true)
	})
	it('manifest lists at least one guide', () => {
		expect(report.input).toEqual([])
		expect(entries.length).toBeGreaterThan(0)
		expect(own.entry.spec).toBe(GUIDE_SPEC)
	})

	// The example half of the equality case is silent over an empty population: with no
	// title on both sides `findDrift` compares no pair and the case passes on the summaries
	// alone. This pins the population this repository's own guide contributes, so removing
	// every `@example` title reddens the suite instead of quietly retiring half the gate.
	// The failure names both title sets, because a pin reporting only its own emptiness
	// leaves the reader to work out which side dropped the title.
	it('pairs at least one example title across the guide and the source', () => {
		expect(report.examples.titles.filter((finding) => finding.spec === GUIDE_SPEC)).toEqual([])
	})

	// The README's pitch and the guide's tagline are one text, each read as the blockquote
	// under its file's H1. `README.md` is outside the concept index, so the reader is
	// applied to it directly rather than through a manifest row. Each side is guarded
	// against `undefined` first, so a file that lost its blockquote reports that rather
	// than reporting two absences as agreement.
	it('opens the README with the guide tagline', () => {
		expect(manifest.name).toBe(PACKAGE_NAME)
		expect(report.pitch).toEqual([])
	})

	it('imports only real exports in every root README ```ts fence', () => {
		const readme = createGuide(requireValue(files['README.md'], 'Missing file: README.md'))
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
		for (const { entry } of entries) {
			expect(files[entry.spec]).toBeDefined()
			const modules = typeof entry.source === 'string' ? [entry.source] : entry.source
			for (const module of modules) {
				expect(Object.keys(files).some((path) => path.startsWith(`${module}/`))).toBe(true)
			}
			expect(Object.keys(files).some((path) => path.startsWith(`${entry.tests}/`))).toBe(true)
		}
	})

	for (const { entry, guide, source } of entries) {
		describe(`${entry.concept}`, () => {
			it('uses only listed fence languages', () => {
				expect(report.fences.filter((finding) => finding.spec === entry.spec)).toEqual([])
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

			it('documents populated method groups', () => {
				expect(report.sections.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})
			it('keeps behavioral interfaces and implementing classes in parity', () => {
				expect(report.methods.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			// The shared report compares summaries and titled examples. Choose the authority
			// explicitly with `npm run test:guides -- --to guide` or `--to source`; do not
			// weaken this assertion to hide drift.
			it('keeps every compared summary and example equal to its source', () => {
				expect(report.drift.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('documents an example for every Surface function', () => {
				expect(report.examples.functions.filter((finding) => finding.spec === entry.spec)).toEqual(
					[],
				)
			})

			for (const group of guide.methods()) {
				const entity = group.interface.replace(/Interface$/, '')
				const documented = group.methods.map((method) => method.name)
				const examples =
					entity === group.interface
						? source.examples(group.interface).map((example) => example.name)
						: source
								.examples(group.interface)
								.map((example) => example.name)
								.concat(source.examples(entity).map((example) => example.name))
				describe(`${group.interface} examples`, () => {
					it('documents an example for every method', () => {
						const fences = guide
							.fences()
							.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
							.map((fence) => fence.code)
						expect(findUnexampled(documented, fences, examples)).toEqual([])
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
			const grid = createGrid(
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

			grid.filter.set({ column: 'name', operator: 'contains', text: 'a' })
			grid.sort.set({ column: 'age', direction: 'descending' })

			expect(grid.count).toBe(3)
			expect(grid.pagination.count).toBe(2)
			expect(grid.view.map((row) => row.name)).toStrictEqual(['Grace', 'Alan'])
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
			const schema: GridSchema = {
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
			const grid = createGrid(
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

			grid.filter.set({ column: 'name', operator: 'contains', text: 'ADA' })
			expect(grid.count).toBe(1)
		})

		it('refuses duplicate and absent identities atomically', () => {
			const grid = createGrid({
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'text', key: 'name' },
				],
			})
			grid.rows.add({ id: '7', name: 'Ada' })

			expect(readGridError(() => grid.rows.add({ id: '7', name: 'Grace' }))).toBe('KEY')
			expect(readGridError(() => grid.rows.add({ name: 'Alan' }))).toBe('KEY')
			expect(grid.rows.rows().length).toBe(1)
		})

		it('merges an update without moving identity', () => {
			const grid = createGrid(
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

			expect(grid.rows.update({ id: '1', age: 37 })).toBe(true)
			expect(grid.rows.row('1')).toStrictEqual({ id: '1', name: 'Ada', age: 37 })
			expect(grid.rows.update({ id: '9', name: 'Nobody' })).toBe(false)
			expect(grid.rows.rows().length).toBe(1)
		})

		it('extracts only usable identities', () => {
			const schema: GridSchema = { key: 'id', columns: [{ cell: 'text', key: 'id' }] }
			expect(extractGridKey(schema, { id: '7' })).toBe('7')
			expect(extractGridKey(schema, { id: '' })).toBeUndefined()
			expect(extractGridKey(schema, { name: 'Ada' })).toBeUndefined()
		})

		it('sorts by ordered terms', () => {
			const grid = createGrid(
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

			grid.sort.set([
				{ column: 'team', direction: 'ascending' },
				{ column: 'age', direction: 'descending' },
			])
			expect(grid.view.map((row) => row.id)).toStrictEqual(['1', '3', '2'])
			expect(grid.sort.order('age')).toStrictEqual({
				column: 'age',
				direction: 'descending',
			})
		})

		it('merges, compares, and removes lens terms', () => {
			const current: readonly GridOrder[] = [
				{ column: 'team', direction: 'ascending' },
				{ column: 'age', direction: 'descending' },
			]
			const next = mergeTerms(current, [{ column: 'age', direction: 'ascending' }])

			expect(next.map((order) => order.column)).toStrictEqual(['team', 'age'])
			expect(
				matchesTerms(next, current, (order, other) => order.direction === other.direction),
			).toBe(false)
			expect(removeTerms(next, ['team']).map((order) => order.column)).toStrictEqual(['age'])
		})

		it('sorts rows without moving the input', () => {
			const schema: GridSchema = {
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'number', key: 'age' },
				],
			}
			const rows = [{ id: '1', age: 40 }, { id: '2' }, { id: '3', age: 30 }]

			expect(
				sortGridRows(schema, rows, [{ column: 'age', direction: 'ascending' }]).map(
					(row) => row.id,
				),
			).toStrictEqual(['2', '3', '1'])
			expect(sortGridRows(schema, rows, []).map((row) => row.id)).toStrictEqual(['1', '2', '3'])
			expect(rows.map((row) => row.id)).toStrictEqual(['1', '2', '3'])
		})

		it('filters with and-only composition', () => {
			const grid = createGrid(
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

			grid.filter.set([
				{ column: 'name', operator: 'contains', text: 'a' },
				{ column: 'age', operator: 'between', minimum: 40, maximum: 50 },
			])
			expect(grid.count).toBe(1)
			expect(grid.view.map((row) => row.name)).toStrictEqual(['Grace'])
			expect(
				readGridError(() => grid.filter.set({ column: 'age', operator: 'contains', text: '4' })),
			).toBe('CELL')
		})

		it('filters rows case-sensitively in input order', () => {
			const schema: GridSchema = {
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
			const lower = filterGridRows(schema, rows, [
				{ column: 'name', operator: 'contains', text: 'a' },
			])
			const upper = filterGridRows(schema, rows, [
				{ column: 'name', operator: 'contains', text: 'A' },
			])

			expect(lower.map((row) => row.name)).toStrictEqual(['Ada', 'Grace'])
			expect(upper.map((row) => row.name)).toStrictEqual(['Ada'])
			expect(filterGridRows(schema, rows, []).length).toBe(3)
		})

		it('clamps and removes pagination', () => {
			const grid = createGrid(
				{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
				{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }], limit: 2 },
			)

			expect(grid.pagination.count).toBe(3)
			grid.pagination.move(9)
			expect(grid.pagination.page).toBe(3)
			expect(grid.pagination.offset).toBe(4)
			expect(grid.view.map((row) => row.id)).toStrictEqual(['5'])
			grid.pagination.resize()
			expect(grid.pagination.limit).toBeUndefined()
			expect(grid.view.length).toBe(5)
		})

		it('selects visible keys and prunes removed rows', () => {
			const grid = createGrid(
				{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
				{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
			)

			grid.selection.select(grid.view.map((row) => String(row.id)))
			expect(grid.selection.keys.size).toBe(3)
			grid.selection.toggle('2')
			expect(grid.selection.keys.has('2')).toBe(false)
			grid.rows.remove('1')
			expect(grid.selection.keys.has('1')).toBe(false)
		})

		it('expands every row and refuses an invalid batch atomically', () => {
			const grid = createGrid(
				{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
				{ rows: [{ id: '1' }, { id: '2' }, { id: '3' }] },
			)

			grid.expansion.expand()
			expect(grid.expansion.keys.size).toBe(3)
			grid.expansion.clear('2')
			expect(grid.expansion.expand(['2', '9'])).toBe(false)
			expect(grid.expansion.keys.has('2')).toBe(false)
			grid.expansion.toggle('2')
			expect(grid.expansion.keys.size).toBe(3)
		})

		it('clears for reuse and destroys idempotently', () => {
			const grid = createGrid(
				{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
				{ rows: [{ id: '1' }, { id: '2' }] },
			)

			grid.clear()
			expect(grid.count).toBe(0)
			grid.rows.add({ id: '3' })
			grid.destroy()
			grid.destroy()
			expect(grid.destroyed).toBe(true)
			expect(grid.count).toBe(1)
			expect(readGridError(() => grid.rows.add({ id: '4' }))).toBe('DESTROYED')
		})

		it('announces only committed moves', () => {
			const seen: string[] = []
			const grid = createGrid(
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
			grid.emitter.on('clear', () => seen.push('clear'))

			grid.rows.add({ id: '2', age: 45 })
			grid.sort.set({ column: 'age', direction: 'ascending' })
			grid.sort.set({ column: 'age', direction: 'ascending' })
			grid.clear()

			expect(seen).toStrictEqual(['write 2', 'sort 1', 'clear'])
		})

		it('round-trips a schema through JSON exactly', () => {
			const schema: GridSchema = {
				name: 'people',
				label: 'People',
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id', label: 'Reference' },
					{ cell: 'number', key: 'age', label: 'Age', meta: { align: 'right' } },
				],
			}
			const wire = JSON.stringify(serializeGrid(schema))
			const received = parseGrid(JSON.parse(wire))

			expect(JSON.stringify(serializeGrid(received ?? schema))).toBe(wire)
			expect(parseGrid({ key: 'id', columns: 'not a list' })).toBeUndefined()
			expect(parseGrid({ columns: [{ cell: 'text', key: 'id' }] })).toBeUndefined()
		})

		it('coerces and serializes rows at the wire boundary', () => {
			const schema: GridSchema = {
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
			expect(isGridCell(36)).toBe(true)
			expect(isGridCell(null)).toBe(false)
			expect(isGridRow({ id: '1', age: 36 })).toBe(true)
			expect(isGridRow({ id: ['1'] })).toBe(false)
			expect(isColumnChoice({ value: 'a', label: 'A' })).toBe(true)
			expect(isColumnChoice({ value: 'a', label: 'A', colour: 'red' })).toBe(false)
			expect(isGridColumn({ cell: 'choice', key: 'status', choices: [] })).toBe(true)
			expect(isGridSchema({ key: 'id', columns: [{ cell: 'text', key: 'id' }] })).toBe(true)
			expect(isGridSchema({ columns: [] })).toBe(false)
		})

		it('owns every clone the guide shows', () => {
			const row = { id: '1', age: 36 }
			const owned = cloneRow(row)

			expect(owned === row).toBe(false)
			expect(Object.isFrozen(owned)).toBe(true)
			expect(
				Object.isFrozen(cloneGridSchema({ key: 'id', columns: [{ cell: 'text', key: 'id' }] })),
			).toBe(true)
		})

		it('reports the audit diagnostics the guide quotes', () => {
			expect(auditGrid({ key: 'ref', columns: [{ cell: 'text', key: 'id' }] })).toStrictEqual([
				'schema key "ref" names no declared column',
			])
			expect(auditGrid({ key: 'age', columns: [{ cell: 'number', key: 'age' }] })).toStrictEqual([
				'schema key "age" names a number column, which holds no identity',
			])
			expect(
				auditGrid({
					key: 'id',
					columns: [
						{ cell: 'text', key: 'id' },
						{ cell: 'text', key: 'id' },
					],
				}),
			).toStrictEqual(['column "id" is declared more than once'])
			expect(auditGrid({ key: 'id', columns: [{ cell: 'text', key: 'id' }] })).toStrictEqual([])
		})

		it('codes each refusal named by the errors table', () => {
			expect(
				readGridError(() => createGrid({ key: 'missing', columns: [{ cell: 'text', key: 'id' }] })),
			).toBe('SCHEMA')
			const grid = createGrid({
				key: 'id',
				columns: [
					{ cell: 'text', key: 'id' },
					{ cell: 'number', key: 'age' },
				],
			})

			expect(readGridError(() => grid.sort.set({ column: 'nope', direction: 'ascending' }))).toBe(
				'COLUMN',
			)
			expect(readGridError(() => grid.rows.add({ id: '1', age: 'twelve' }))).toBe('CELL')
			expect(grid.rows.rows().length).toBe(0)
		})

		it('constructs the class like the factory', () => {
			const grid = new Grid(
				{ key: 'id', columns: [{ cell: 'text', key: 'id' }] },
				{ rows: [{ id: '1' }] },
			)
			expect(grid.count).toBe(1)
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
			const known: readonly GridKey[] = ['1', '2', '3']
			const picked: ReadonlySet<GridKey> = new Set(['1'])

			expect(computeKeys(known, picked, '2', () => true)?.size).toBe(2)
			expect(computeKeys(known, picked, '9', () => true)).toBeUndefined()
			expect(computeKeys(known, picked, '1', () => true) === picked).toBe(true)
			expect(computeKeys(known, picked, undefined, (included) => !included)?.size).toBe(2)
		})

		it('draws the shape and audit boundary between the schema guards', () => {
			const unsound = { key: 'missing', columns: [{ cell: 'text', key: 'id' }] }

			expect(isStructuralGridSchema(unsound)).toBe(true)
			expect(isGridSchema(unsound)).toBe(false)
			expect(parseGrid(unsound)).toBeUndefined()
			expect(isStructuralGridSchema({ columns: [] })).toBe(false)
		})
	})

	describe('README.md Usage fence', () => {
		it('executes the value claims in its comments', () => {
			const picked: number[] = []
			const grid = createGrid(
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

			grid.filter.set({ column: 'status', operator: 'equals', value: 'live' })
			grid.sort.set({ column: 'age', direction: 'descending' })
			expect(grid.count).toBe(2)
			expect(grid.view.map((row) => row.name)).toStrictEqual(['Alan', 'Ada'])
			grid.selection.toggle('1')
			expect(grid.selection.keys.has('1')).toBe(true)
			expect(picked).toStrictEqual([1])
		})
	})
})
