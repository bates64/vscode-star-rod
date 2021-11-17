import vscode, { TextDocument, CancellationToken, CodeLens, ExtensionContext, SnippetString, Position, Range, Uri } from 'vscode'
import Script from './Script'

function stripOffsets(block: string): string {
    return block.replace(/^(\s*[A-F0-9]+|        ):  /gm, '\t')
}

export default class StarRodCodeLensProvider implements vscode.CodeLensProvider {
    async provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
        const script = new Script(document)

        const scope = script.scope()
        const dir = script.directory()
        if (!scope || !dir) return [] // Not a script

        let patchScript: Script | Uri | undefined = ['patch', 'import'].includes(dir.subdir) ? script : await script.findRelevantScript('patch')
        if (!patchScript) {
            patchScript = script.goodLocationForRelevantScript('patch')
        }

        const lenses: CodeLens[] = []

        // Add lenses for syntax in the script
        const directives = script.parseDirectives()
        for (const directive of directives) {
            if (directive.keyword === '#new') {
                const identifier = directive.atoms[0]

                if (patchScript && patchScript !== script) {
                    {
                        const snippet = new SnippetString()
                        snippet.appendText(`@ ${identifier} {\n`)
                        snippet.appendPlaceholder(stripOffsets(directive.block?.replace(/^\r?\n/, '') ?? ''))
                        snippet.appendText('}')
                        snippet.appendText('\n')
                        lenses.push(new CodeLens(directive.range, {
                            title: 'Patch',
                            command: 'starRod.codeLens.insertPatchSnippet',
                            arguments: [patchScript, snippet],
                        }))
                    }

                    {
                        const snippet = new SnippetString()
                        snippet.appendText(`#alias ${identifier} `)
                        snippet.appendPlaceholder('')
                        snippet.appendText('\n')
                        lenses.push(new CodeLens(directive.range, {
                            title: 'Alias',
                            command: 'starRod.codeLens.insertPatchSnippet',
                            arguments: [patchScript, snippet],
                        }))
                    }

                    {
                        const snippet = new SnippetString()
                        snippet.appendText(`#delete ${identifier}`)
                        snippet.appendText('\n')
                        lenses.push(new CodeLens(directive.range, {
                            title: 'Delete',
                            command: 'starRod.codeLens.insertPatchSnippet',
                            arguments: [patchScript, snippet],
                        }))
                    }
                }
            }

            // TODO: @ - go to #new

            // TODO: #import - open file
        }

        /*
        // Add links to open relevant src/gen/patch scripts, if they exist, at the top of the file.
        // TODO: 'Open Map Editor'
        const relevantScripts = []
        const subdir = script.directory()?.subdir
        if (subdir !== 'patch') relevantScripts.push(patchScript)
        if (subdir !== 'src') relevantScripts.push(script.findRelevantScript('src'))
        if (subdir !== 'gen') relevantScripts.push(script.findRelevantScript('gen'))

        for (const script of await Promise.all(relevantScripts)) {
            if (script instanceof Script) {
                const subdir = script.directory()?.subdir
                lenses.unshift(new CodeLens(new Range(0, 0, 0, 0), {
                    title: `View ${subdir} file`,
                    command: 'starRod.codeLens.openScript',
                    arguments: [script],
                }))
            }
        }
        */

        return lenses
    }
}

export function activate(ctx: ExtensionContext): void {
    ctx.subscriptions.push(vscode.languages.registerCodeLensProvider('starrod', new StarRodCodeLensProvider()))

    ctx.subscriptions.push(vscode.commands.registerCommand('starRod.codeLens.insertPatchSnippet', async (script: Script | Uri, snippet: SnippetString) => {
        console.log(script)
        const document = script instanceof Script
            ? script.document
            : await vscode.workspace.openTextDocument(script) // Create file.

        const editor = await vscode.window.showTextDocument(document)

        editor.insertSnippet(snippet, new Position(document.lineCount + 2, 0))
    }))
}
