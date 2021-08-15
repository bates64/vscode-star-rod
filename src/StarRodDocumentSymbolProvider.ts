import vscode, { TextDocument, CancellationToken, DocumentSymbol, ExtensionContext, SymbolKind, Position, Range, Uri } from 'vscode'
import Script from './Script'

export default class StarRodDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    async provideDocumentSymbols(document: TextDocument, token: CancellationToken): Promise<DocumentSymbol[]> {
        const script = new Script(document)
        const symbols = []

        const directives = script.parseDirectives()
        for (const directive of directives) {
            if (directive.keyword === '#new' || (directive.keyword === '#export' && directive.args.length >= 1)) {
                const identifier = directive.atoms[0]
                const structType = directive.args[0]

                symbols.push(new DocumentSymbol(
                    identifier,
                    structType,
                    structTypeToSymbolKind(structType, identifier),
                    directive.range,
                    directive.rangeIncludingComment,
                ))
            } else if (directive.keyword === '@') {
                const identifier = directive.atoms[0]

                symbols.push(new DocumentSymbol(
                    identifier,
                    'patch',
                    SymbolKind.Variable,
                    directive.range,
                    directive.rangeIncludingComment,
                ))
            } else if (directive.keyword === '#string') {
                if (directive.args.length === 2) {
                    const [section, index] = directive.args

                    symbols.push(new DocumentSymbol(
                        `${section}:${index}`,
                        'patch',
                        SymbolKind.String,
                        directive.range,
                        directive.rangeIncludingComment,
                    ))
                } else if (directive.atoms.length >= 1) {
                    const identifier = directive.atoms[0]

                    symbols.push(new DocumentSymbol(
                        identifier,
                        'new String',
                        SymbolKind.String,
                        directive.range,
                        directive.rangeIncludingComment,
                    ))
                }
            }
        }

        // TODO: labels within functions and scripts

        return symbols
    }
}

function structTypeToSymbolKind(structType: string, identifier?: string): SymbolKind {
    if (structType.startsWith('Function')) {
        // 'api' if the identifier has uppercase characters. 'asm' by default.
        const usage = (identifier && /[A-Z]/.test(identifier)) ? 'api' : 'asm'

        // API functions are *not* classes, but it's the closest we can get given that Function and
        // Method are taken. The same mapping is also used by the database providers in `libProvider.ts`.
        return usage === 'api' ? SymbolKind.Class :  SymbolKind.Function
    }

    if (structType.startsWith('Script')) return SymbolKind.Method
    if (structType === 'String') return SymbolKind.String
    if (structType.endsWith('List')) return SymbolKind.Array

    return SymbolKind.Struct
}

export function activate(ctx: ExtensionContext): void {
    ctx.subscriptions.push(vscode.languages.registerDocumentSymbolProvider('starrod', new StarRodDocumentSymbolProvider()))
}
