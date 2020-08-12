import vscode, { TextDocument, Position, Range, Uri, RelativePattern } from 'vscode'
import { sep } from 'path'
import moo from 'moo'

import { StringDecoder } from 'string_decoder'
const deUtf8 = new StringDecoder('utf8')

export type Scope = 'map' | 'battle' | 'world'

export type Directive = {
    comment?: string

    keyword: string
    args: string[]

    atoms: string[]

    block?: string

    range: Range
    rangeIncludingComment: Range
}

const lexer = moo.states({
    main: {
        // Note: '...' line continuation is supported but this feature is not yet present in Star Rod!
        ws: { match: /[ \t]+|\.\.\.\r?\n/, lineBreaks: true },

        linecomment: /%.*/,
        blockcommentstart: { match: '/%', push: 'blockcomment' },
        string: /"(?:\\["\\]|[^\r\n"\\])*?"/,

        lbrace: { match: '{', push: 'block' },
        rbrace: '}',

        directive: /[#@][a-zA-Z0-9:_()]*/,

        nl: { match: /\r?\n/, lineBreaks: true },
        atom: /[^\s%{}=,"]+/,
    },
    blockcomment: {
        blockcommentend: { match: '%/', pop: 1 },
        blockcommentcontent: { match: /[^%]+|%[^\/]/, lineBreaks: true },
    },
    block: {
        rbrace: { match: '}', pop: 1 },
        blockcontent: { match: /[^}]+/, lineBreaks: true },
    },
})

const cache: Map<string, { version: number, script: Script }> = new Map()

export default class Script {
    document: TextDocument

    constructor(document: TextDocument) {
        this.document = document

        const cacheHit = cache.get(document.fileName)
        if (cacheHit && cacheHit.version >= document.version) {
            return cacheHit.script
        }

        cache.set(document.fileName, { version: document.version, script: this })
    }

    scope(): Scope | undefined {
        const { ext } = this.parseFsPath()

        if (ext === 'mscr' || ext === 'mpat') return 'map'
        if (ext === 'bscr' || ext === 'bpat') return 'battle'
        if (ext === 'wscr' || ext === 'wpat') return 'world'

        return undefined
    }

    directory(): { tld: Uri, subdir: string } | undefined {
        const scope = this.scope()

        // Walk up until we find a top-level directory (battle/*, map, world/*) for this scope.
        const { segments } = this.parseFsPath()
        let dirName
        let prevDir = ''
        while (dirName = segments.pop()) {
            if ((scope === 'map' && dirName === 'map') ||
                (scope === 'battle' && dirName === 'formation') ||
                (scope === 'battle' && dirName === 'item') ||
                (scope === 'battle' && dirName === 'move') ||
                (scope === 'battle' && dirName === 'partner') ||
                (scope === 'battle' && dirName === 'starpower') ||
                (scope === 'world' && dirName === 'partner')
            ) {
                // We're here! Reconstruct a Uri to this directory.
                return {
                    tld: Uri.file(`${sep}${segments.join(sep)}${sep}${dirName}`),
                    subdir: prevDir,
                }
            }

            prevDir = dirName
        }

        // Not a patch script?
        return undefined
    }

    private parseFsPath(): { segments: string[], name: string, ext: string } {
        const segments = this.document.uri.fsPath.split(sep)

        const base = segments.pop() ?? ''
        const baseParts = base.split('.')

        const ext = baseParts.pop() ?? ''
        const name = baseParts.join('.')

        return { segments, name, ext }
    }

    private parseDirectivesCache?: { directives: Directive[], version: number }
    parseDirectives(): Directive[] {
        if (this.parseDirectivesCache?.version === this.document.version)
            return this.parseDirectivesCache.directives

        lexer.reset(this.document.getText())
        const tokens = []
        {
            let token
            while (token = lexer.next()) {
                tokens.push(token)
            }
        }

        // All documentation comments ("%!") leading up to the directive
        let comment: string | undefined
        let commentPos: Position | undefined

        // e.g. "#new" of "#new:String", also "@"
        let keyword: string | undefined

        // e.g. ["String"] of "#new:String"
        let args: string[] = []

        // Whitespace-delimited parameters, such as identifiers
        let atoms: string[] = []

        // The block content
        let block: string | undefined

        let start: Position = new Position(0, 0)

        const directives: Directive[] = []

        for (let t = 0; t < tokens.length; t++) {
            const token = tokens[t]
            const position = new Position(token.line - 1, token.col - 1)

            // Combine documentaton comments.
            if (token.type === 'linecomment' && token.text.startsWith('%!')) {
                if (comment) {
                    comment += '\n'
                    comment += token.text.substr(2)
                } else {
                    comment = token.text.substr(2)
                    commentPos = position
                }
                continue
            }

            // Parses the first part of the header into `keyword` and `args`.
            if (token.type === 'directive') {
                [ keyword, ...args ] = token.text.split(':')
                start = position
                continue
            }

            // Remember any atoms following the header.
            if (token.type === 'atom' && keyword) {
                atoms.push(token.text)
            }

            // Remember {block content}.
            if (token.type === 'blockcontent' && keyword) {
                block = token.text
                // Fallthrough...
            }

            // End directive when a block, or a newline not followed by a block, is encountered.
            // Note: this does not match how Star Rod parses directives with blocks (it expects them depending
            // on the directive type, e.g. #new requires a block), but it should suffice for any sane codestyle.
            if ((token.type === 'blockcontent' || (token.type === 'nl' && tokens[t + 1]?.type !== 'lbrace')) && keyword) {
                const end = token.type === 'blockcontent'
                    ? new Position(tokens[t + 1].line - 1, tokens[t + 1].col - 1) // FIXME: rbrace not included in range
                    : position

                directives.push({
                    comment,
                    keyword,
                    args,
                    atoms,
                    block,
                    range: new Range(start, end),
                    rangeIncludingComment: new Range(commentPos ?? start, end),
                })
                comment = undefined
                keyword = undefined
                args = []
                atoms = []
                block = undefined
                start = end
                commentPos = undefined
            }
        }

        this.parseDirectivesCache = { directives, version: this.document.version }
        return directives
    }

    async findRelevantScript(subdir: string): Promise<Script | undefined> {
        const workspace = vscode.workspace.getWorkspaceFolder(this.document.uri)
        if (!workspace) return undefined

        const { name } = this.parseFsPath()
        const dir = this.directory()
        if (!dir) return undefined

        const scope = this.scope()
        if (!scope) return undefined
        const ext = scope.substr(0, 1) + (subdir === 'src' ? 'scr' : 'pat')

        // Find a file with the same name in the relevant `patch` subdirectory.
        const [ uri ] = await vscode.workspace.findFiles(new RelativePattern(dir.tld.path, `${subdir}/**/${name}.${ext}`), null, 1)
        if (!uri) return undefined

        return new Script(await vscode.workspace.openTextDocument(uri))
    }

    goodLocationForRelevantScript(subdir: string): Uri | undefined {
        const { name } = this.parseFsPath()
        const dir = this.directory()
        if (!dir) return undefined

        const scope = this.scope()
        if (!scope) return undefined
        const ext = scope.substr(0, 1) + (subdir === 'src' ? 'scr' : 'pat')

        return dir.tld.with({ path: `${dir.tld.path}${sep}${subdir}${sep}${name}.${ext}` })
    }
}
