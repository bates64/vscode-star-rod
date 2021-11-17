import * as vscode from 'vscode'
import { exec, spawn } from 'child_process'
import { promisify as p } from 'util'
import fs from 'fs'
import { StringDecoder } from 'string_decoder'
import { getStarRodDir } from './extension'

const deUtf8 = new StringDecoder('utf8')
const fileExists = (s: string) => new Promise(r => fs.access(s, fs.constants.F_OK, e => r(!e)))

export default class Mod {
    uri: vscode.Uri

    constructor(uri: vscode.Uri) {
        this.uri = uri
    }

    static getActive(): Mod | undefined {
        const activeUri = vscode.window.activeTextEditor?.document?.uri

        let workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        if (activeUri) {
            workspaceFolder = vscode.workspace.getWorkspaceFolder(activeUri)
        }

        if (!workspaceFolder) return undefined
        return new Mod(workspaceFolder.uri)
    }

    async compile(): Promise<{ emitError?: () => Promise<void> }> {
        const starRodDir = getStarRodDir()
        if (!starRodDir) throw new Error('Star Rod install directory not configured')

        const resetCfg = await this.setMainCfg(starRodDir, 'ModPath', this.uri.fsPath)

        try {
            const { stdout } = await p(exec)('java -Xmx1G -jar StarRod.jar -CompileMod', {
                cwd: starRodDir.fsPath,
                maxBuffer: 4194304, // 4 MiB 
            })

            // Attempt to check specific errors
            // TODO: work out why this doesn't work
            const error = stdout.match(/> Executing patch: ([a-zA-Z0-9_.]+)(?:\r?\n> Creating struct: .*)*\r?\n> ERROR: .*$\e?\n> (.*)$/m)
            if (error) {
                return {
                    emitError: async () => {
                        const [ , filename, message ] = error

                        let uri
                        if (filename.endsWith('.mpat')) {
                            uri = await this.findFilenameRecursive(
                                this.uri.with({ path: this.uri + '/map/patch' }),
                                filename,
                            )
                        } else if (filename.endsWith('.bpat')) {
                            uri = await this.findFilenameRecursive(
                                this.uri.with({ path: this.uri + '/battle' }),
                                filename,
                            )
                        } else if (filename.endsWith('.patch')) {
                            uri = await this.findFilenameRecursive(
                                this.uri.with({ path: this.uri + '/globals/patch' }),
                                filename,
                            )
                        }

                        if (uri) {
                            const choice = await vscode.window.showErrorMessage(`Error in ${filename}: ${message}`, 'View File')
                            if (choice === 'View File') {
                                const doc = await vscode.workspace.openTextDocument(uri)
                                await vscode.window.showTextDocument(doc)
                            }
                        } else {
                            await vscode.window.showErrorMessage(`Error in ${filename}: ${message}`)
                        }
                    }
                }
            }

            const errors = this.parseStdoutErrorsBasic(stdout)
            if (errors.length) {
                return {
                    emitError: async () => {
                        const choice = await vscode.window.showErrorMessage('An error occurred while compiling the mod.', 'View Log')
                        if (choice === 'View Log') {
                            const doc = await vscode.workspace.openTextDocument(this.uri.with({
                                path: this.uri.path + '/logs/compile.log',
                            }))
                            await vscode.window.showTextDocument(doc)
                        }
                    }
                }
            }
        } finally {
            await resetCfg()
        }
        
        return {}
    }

    async compileMap(mapName: string): Promise<{ emitError?: () => Promise<void> }> {
        const starRodDir = getStarRodDir()
        if (!starRodDir) throw new Error('Star Rod install directory not configured')

        const resetCfg = await this.setMainCfg(starRodDir, 'ModPath', this.uri.fsPath)

        try {
            const { stdout } = await p(exec)(`java -Xmx1G -jar StarRod.jar -CompileMap ${mapName}.xml`, {
                cwd: starRodDir.fsPath,
            })

            const errors = this.parseStdoutErrorsBasic(stdout)
            if (errors.length) {
                return {
                    emitError: async () => {
                        const choice = await vscode.window.showErrorMessage(`An error occurred while compiling ${mapName}.`, 'View Log')
                        if (choice === 'View Log') {
                            const doc = await vscode.workspace.openTextDocument({ content: stdout })
                            await vscode.window.showTextDocument(doc)
                        }
                    }
                }
            }
        } finally {
            await resetCfg()
        }

        return {}
    }

    async getSaveMaps(): Promise<string[]> {
        const dirList = await vscode.workspace.fs.readDirectory(this.uri.with({ path: this.uri.path + '/map/save' }))

        // TODO(SR 0.3.0): use findFilenameRecursive
        return dirList
            .filter(([string, fileType]) => string.endsWith('.xml'))
            .map(([string, fileType]) => string.substr(0, string.length - 4))
    }

    async runEmulator() {
        const config = vscode.workspace.getConfiguration()
        let emulator = config.get('starRod.emulatorPath', '')

        if (!emulator) {
            // Let's make some guesses...
            const guesses = [
                '/usr/bin/mupen64plus',
                '/usr/bin/retroarch',
                'C:\\Program Files (x86)\\Project64 2.3\\Project64.exe',
            ]
            for (const guess of guesses) {
                if (await fileExists(guess)) {
                    emulator = guess
                }
            }
        }

        if (!emulator) {
            vscode.window.showWarningMessage('No emulator path configured. Please update it in Settings.')
            return
        }

        const rom = await this.ouputRom()

        if (!rom) {
            vscode.window.showWarningMessage('No output z64 found. Compile the mod before running it.')
            return
        }

        p(spawn)(emulator, [rom.fsPath], {
            cwd: config.get('starRod.emulatorWorkingDir', undefined),
        })
    }

    async ouputRom(): Promise<vscode.Uri | undefined> {
        const dirList = await vscode.workspace.fs.readDirectory(this.uri.with({ path: this.uri.path + '/out' }))
        const romName = dirList.find(([name]) => name.endsWith('.z64'))?.[0]

        if (romName) {
            return this.uri.with({ path: this.uri.path + '/out/' + romName })
        }

        return undefined
    }

    async getModConfig(): Promise<Map<string, string>> {
        const path = this.uri.with({ path: this.uri.path + '/mod.cfg' })
        const original = await vscode.workspace.fs.readFile(path)

        const map = deUtf8.write(Buffer.from(original)).split(/\r?\n/)
            .reduce((obj, line) => {
                const match = line.match(/^([a-zA-Z]+) = (.*)$/)

                if (match) {
                    obj.set(match[1], match[2])
                }

                return obj
            }, new Map())

        return map
    }

    private async setMainCfg(starRodDir: vscode.Uri, key: string, value: string): Promise<() => Promise<void>> {
        const path = starRodDir.with({ path: starRodDir.path + '/cfg/main.cfg' })
        const original = await vscode.workspace.fs.readFile(path)

        const newContent = deUtf8.write(Buffer.from(original)).split(/\r?\n/)
            .map(line => {
                const lineKey = line.match(/^([a-zA-Z]+) = (.*)$/)?.[1]
                
                if (key === lineKey) {
                    return `${key} = ${value}`
                } else {
                    return line
                }
            })
            .join('\n')

        await vscode.workspace.fs.writeFile(path, Uint8Array.from(Buffer.from(newContent, 'utf8')))

        return async () => {
            await vscode.workspace.fs.writeFile(path, original)
        }
    }

    private parseStdoutErrorsBasic(stdout: string): string[] {
        return stdout
            .split('\n')
            .filter(line => line.startsWith('> ERROR: '))
            .map(line => line.substring('> ERROR: '.length))
    }

    private async findFilenameRecursive(dir: vscode.Uri, filename: string): Promise<vscode.Uri | undefined> {
        const dirList = await vscode.workspace.fs.readDirectory(this.uri.with({ path: this.uri.path + '/map/save' }))

        for (const [name, fileType] of dirList) {
            const uri = dir.with({ path: dir.path + '/' + name })

            if (fileType === vscode.FileType.File && name === filename) {
                return uri
            } else if (fileType === vscode.FileType.Directory) {
                const found = await this.findFilenameRecursive(uri, filename)
                if (found) return found
            }
        }

        return undefined
    }
}
