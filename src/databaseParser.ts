import { Location } from 'vscode'
import moo from 'moo'

export type Database = {
    common: Entry[]
    battle: Entry[]
    world: Entry[]
    pause: Entry[]
}

export type Usage = 'api' | 'asm' | 'scr' | 'any'

export type Entry = {
    usage: Usage
    structType?: string
    ramAddress?: string
    romAddress?: string
    name: string
    note?: string
    args?: Arg[] // Unknown if undefined
    returns?: Arg[] // Unknown if undefined
    attributes: Attributes
    location?: Location
}

export type Arg = {
    name?: string
    type: string
    container?: string
    note?: string
    attributes: Attributes
}

export type Attributes = Record<string, string | true | undefined>

const lexer = moo.states({
    main: {
        ws: { match: /[ \t]+|\.\.\.\r?\n/, lineBreaks: true },
        linecomment: /%.*/,
        blockcommentstart: { match: '/%', push: 'blockcomment' },
        string: /"(?:\\["\\]|[^\r\n"\\])*?"/,

        comma: ',',
        colon: ':',
        lbrace: '{',
        rbrace: '}',
        eq: '=',

        nl: { match: /\r?\n/, lineBreaks: true },
        identifier: /[^\s%{}=,"]+/,
        error: moo.error,
    },
    blockcomment: {
        blockcommentend: { match: '%/', pop: 1 },
        blockcommentcontent: { match: /[^%]+|%[^\/]/, lineBreaks: true },
    }
})

function fail(token: moo.Token, explanation?: string): never {
    let message = `Unexpected ${token.type} "${token.text}" at line ${token.line} col ${token.col}`

    if (explanation) {
        message += ', '
        message += explanation
    }

    throw new Error(message)
}

function expect(token?: moo.Token, ...types: string[]): moo.Token {
    if (!token?.type) {
        throw new Error(`Unexpected end of file, expected ${types.join(', ')}`)
    }

    if (types.includes(token.type)) {
        return token
    }

    fail(token, `expected ${types.join(', ')}`)
}

export function parse(source: string): { scope: keyof Database, entries: Entry[] } {
    lexer.reset(source)

    let scope
    let entries: Entry[] = []

    // Parse entry state
    let parts: typeof part[] = [] // Separated by colons
    let part: typeof subpart[] = [] // Separated by commas
    let subpart : {
        attributes: Attributes,
        note?: string,
        identifiers: string[],
    } = {
        attributes: {},
        identifiers: [],
    }

    const endPart = () => {
        if (part.length) parts.push(part)
        part = []
    }
    const endSubpart = () => {
        if (subpart.identifiers) part.push(subpart)
        subpart = { attributes: {}, identifiers: [] }
    }

    for (const token of lexer) {
        // Ignore whitespace and line comments
        if (token.type === 'ws' || token.type === 'linecomment') continue

        // Ignore block comments
        if (token.type === 'blockcommentstart') {
            if (expect(lexer.next(), 'blockcommentcontent', 'blockcommentend').type === 'blockcommentcontent')
                expect(lexer.next(), 'blockcommentend')
            continue
        }

        const isHeader = entries.length === 0 && !parts.length

        // Parse attributes
        if (token.type === 'lbrace') {
            const attributes: Attributes = {}

            while (true) {
                const key = expect(lexer.next(), 'identifier').text

                let separator = expect(lexer.next(), 'eq', 'comma', 'rbrace')
                if (separator.type === 'eq') {
                    const value = expect(lexer.next(), 'identifier').text
                    attributes[key] = value

                    separator = expect(lexer.next(), 'comma', 'rbrace')
                } else {
                    attributes[key] = true
                }

                if (separator.type === 'rbrace') {
                    break
                } else {
                    // Consume comma
                }
            }

            if (isHeader) {
                if (attributes.scope) scope = attributes.scope
            } else {
                Object.assign(subpart.attributes, attributes)
            }

            continue
        }

        if (token.type === 'identifier') {
            subpart.identifiers.push(token.text)
            continue
        }

        if (token.type === 'string') {
            subpart.note = JSON.parse(token.text).toString()
            continue
        }

        if (token.type === 'comma') {
            endSubpart()
            continue
        }

        if (token.type === 'colon') {
            endSubpart()
            endPart()
            continue
        }

        // Ignore newlines in the header
        if (token.type === 'nl') {
            // End entry
            if (!isHeader) {
                endSubpart()
                endPart()

                if (parts.length < 4) {
                    // Unfinished or empty line, ignore it.
                    parts = []
                    continue
                }
                const [usageP, locationP, nameP, ...restParts] = parts

                const usage = usageP[0].identifiers[0]
                const ramAddress = locationP[0].identifiers[0]
                const romAddress = locationP[1]?.identifiers[0]
                const name = nameP[0].identifiers[0]

                if (usage === 'api' || usage === 'asm' || usage === 'scr') {
                    const [ returnsP, argsP ] = restParts

                    // TODO: support multiple signatures?

                    const mapArgs = (argsP: typeof part): Arg[] | undefined => {
                        if (argsP[0].identifiers[0] === 'void') return []
                        if (argsP[0].identifiers[0] === '???') return undefined
                        if (argsP[0].identifiers[0] === 'varargs') return undefined

                        return argsP.map((s): Arg => {
                            return {
                                container: s.identifiers.length > 3 ? s.identifiers.shift() : undefined,
                                type: s.identifiers[0],
                                name: s.identifiers[1],
                                attributes: s.attributes,
                            }
                        })
                    }

                    // TODO: entry.location pointing to the relevant struct in dump/lib/

                    entries.push({
                        usage,
                        structType: {
                            scr: 'Script',
                            asm: 'Function',
                            api: 'Function',
                        }[usage],
                        name,
                        note: nameP[0].note,
                        ramAddress,
                        romAddress,
                        attributes: nameP[0].attributes,
                        args: mapArgs(argsP || []),
                        returns: mapArgs(returnsP || []),
                    })
                } else if (usage) {
                    console.warn(`Ignoring unknown usage type "${usage}" on line ${token.line}`)
                }
            }

            parts = []
            continue
        }

        fail(token)
    }

    if (scope === 'battle' || scope === 'world' || scope === 'common' || scope === 'pause') {
        return { scope, entries }
    } else {
        throw new Error(`Unknown scope: ${scope}`)
    }
}
