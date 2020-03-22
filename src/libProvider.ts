import {
    languages,
    ExtensionContext,
    Hover,
    MarkdownString,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    CompletionItem,
} from 'vscode'

import * as lib from './lib.json'

interface Doc {
    name: string,
    args?: ArgDoc[],
}

interface ArgDoc {
    name: string,
    type: string,
}

function docStringify({ name, args }: Doc): MarkdownString {
    return new MarkdownString(`
## ${name}

Arguments:
${(args || []).map(({ name, type }: ArgDoc, i: number) =>
` ${i + 1}. **${name}**: \`${type}\``
).join('\n')}
    `)
}

export function register() {
    languages.registerHoverProvider('starrod', {
        provideHover(document, position, token) {
            const range = document.getWordRangeAtPosition(position, /[^\s()]+/)
            const word = document.getText(range)

            const line = document.lineAt(position).text.trim().split(/[\s()]+/)
            const selected = line.indexOf(word)

            // Document functions.
            // FIXME: does not support lines with offset prefixes
            if (line[0] == 'Call') {
                // If 'Call' or punctuation is selected, don't display a hover.
                if (selected == 0 || word == '(' || word == ')') {
                    return null
                }

                const doc = lib.functions
                    .find((o: { name: string }) => o.name == line[1])

                // If we don't know the function, we can't display documentation
                // for it!
                if (!doc) {
                    return null
                }

                // If the function name is selected, display docs for the whole
                // function signature.
                if (selected == 1) {
                    return new Hover(docStringify(doc), range)
                }
            }

            return null
        },
    })

    languages.registerSignatureHelpProvider('starrod', {
        provideSignatureHelp(document, position, token, context) {
            const range = document.getWordRangeAtPosition(position, /[^\s()]+/)
            const word = document.getText(range)

            const line = document.lineAt(position).text.trim().split(/[\s()]+/)
            const selected = line.indexOf(word)

            // FIXME: 'selected' is wrong when multiple line words are the same

            if (line[0] == 'Call') {
                const doc = lib.functions
                    .find((o: { name: string }) => o.name == line[1])

                if (!doc) {
                    return null
                }

                // Convert doc to a signature string
                const sigStr = doc.name
                    + '('
                    + (doc.args || [])
                        .map(({ name, type }) => `${name}: ${type}`)
                        .join(' ')
                    + ')'

                const signature = new SignatureInformation(sigStr)
                signature.parameters = (doc.args || []).map(({ name, type }) =>
                    new ParameterInformation(`${name}: ${type}`)
                )

                const help = new SignatureHelp()
                help.activeParameter = selected - 2
                help.activeSignature = 0
                help.signatures = [
                    signature
                ]

                return help
            }

            return null
        }
    }, '(')

    languages.registerCompletionItemProvider('starrod', {
        provideCompletionItems(document, position, token, context) {
            const line = document.lineAt(position).text.trim().split(/[\s()]+/)

            if (line[0] !== 'Call' || !!line[2]) {
                return null
            }

            return lib.functions
                //.filter(o => o.name.startsWith(line[1]))
                .map(o => new CompletionItem(o.name))
        }
    }, ' ')
}
