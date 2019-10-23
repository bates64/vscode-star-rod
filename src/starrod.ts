import {
    languages,
    ExtensionContext,
    Hover,
    MarkdownString,
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

export async function activate(ctx: ExtensionContext) {
    // TODO: signatureHelpProvider

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
}
