import * as vscode from 'vscode'

import { getStarRodDirVersion, getStarRodDir } from './extension'
import Mod from './Mod'
import { listDatabaseFiles } from './database'

const getActiveModSafe = async () => {
    const srVersion = await getStarRodDirVersion()
    if (!srVersion) {
        vscode.window.showErrorMessage('Star Rod installation directory is not configured.')
        return
    }

    const mod = Mod.getActive()

    if (!mod) {
        vscode.window.showErrorMessage('No mod folder open.')
        return
    }

    try {
        await mod.getModConfig()
    } catch {
        vscode.window.showErrorMessage('No mod folder open.')
        return
    }

    return mod
}

export default function activate(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(vscode.commands.registerCommand('starRod.compileMod', async () => {
        const mod = await getActiveModSafe()
        if (!mod) return

        let obj = await vscode.window.withProgress({
            title: `Compiling Mod...`,
            location: vscode.ProgressLocation.Window,
        }, () => mod.compile())

        if (obj.emitError) await obj.emitError()
        else {
            const choice = await vscode.window.showInformationMessage('Compiled mod.', 'Run Mod')
            if (choice === 'Run Mod') {
                await mod.runEmulator()
            }
        }
    }))

    ctx.subscriptions.push(vscode.commands.registerCommand('starRod.compileMap', async () => {
        const mod = await getActiveModSafe()
        if (!mod) return

        const map = await vscode.window.showQuickPick(await mod.getSaveMaps())
        if (map) {
            let obj = await vscode.window.withProgress({
                title: `Compiling ${map}...`,
                location: vscode.ProgressLocation.Window,
            }, () => mod.compileMap(map))

            if (obj.emitError) await obj.emitError()
            else vscode.window.showInformationMessage(`Compiled ${map}.`)
        }
    }))

    ctx.subscriptions.push(vscode.commands.registerCommand('starRod.runMod', async () => {
        const mod = await getActiveModSafe()
        if (!mod) return

        try {
            await mod.getModConfig()
        } catch {
            vscode.window.showErrorMessage('No mod folder open.')
            return
        }

        await mod.runEmulator()
    }))

    ctx.subscriptions.push(vscode.commands.registerCommand('starRod.openDatabase', async () => {
        const dir = getStarRodDir()

        if (!dir) {
            vscode.window.showErrorMessage('Star Rod installation directory is not configured.')
            return
        }

        const srVersion = await getStarRodDirVersion()
        let paths: Record<string, vscode.Uri> = {}
        if (srVersion === '0.2.0') {
            paths = {
                'Shared':           dir.with({ path: dir.path + '/database/shared_func_library.txt' }),
                'Battle Functions': dir.with({ path: dir.path + '/database/battle_func_library.txt' }),
                'Battle Scripts':   dir.with({ path: dir.path + '/database/battle_script_library.txt' }),
                'Map Functions':    dir.with({ path: dir.path + '/database/map_func_library.txt' }),
                'Map Scripts':      dir.with({ path: dir.path + '/database/map_script_library.txt' }),
                'System':           dir.with({ path: dir.path + '/database/system_func_library.txt' }),
            }
        } else if (srVersion?.startsWith('0.3.0')) {
            const files = await listDatabaseFiles(dir)
            paths = files.reduce((paths: Record<string, vscode.Uri>, uri) => {
                const folders = uri.path.split('/')
                const base = folders.pop()

                if (base) {
                    const basename = base.split('.').slice(0, -1).join('.') // Drop file extension
                    paths[basename] = uri
                }

                return paths
            }, {})
        }

        const choice = await vscode.window.showQuickPick(Object.keys(paths))

        if (!choice) {
            return
        }

        const doc = await vscode.workspace.openTextDocument(paths[choice])
        await vscode.window.showTextDocument(doc)
    }))
}
