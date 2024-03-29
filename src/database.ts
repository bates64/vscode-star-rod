import * as vscode from 'vscode'
import { StringDecoder } from 'string_decoder'
const deUtf8 = new StringDecoder('utf8')

import { parse, Database } from './databaseParser'
export { Database, Entry, Arg, Attributes, Usage } from './databaseParser'
import { getStarRodDirVersion } from './extension'

export default async function loadDatabase(starRodDir: vscode.Uri): Promise<Database> {
    const db: Database = {
        common: [],
        battle: [],
        world: [],
        pause: [],
        mainmenu: [],
    }

    for (const uri of await listDatabaseFiles(starRodDir)) {
        try {
            const source = deUtf8.write(Buffer.from(await vscode.workspace.fs.readFile(uri)))
            const { scope, entries } = parse(source)
            db[scope].push(...entries)
        } catch (error) {
            console.error(error)
            vscode.window.showWarningMessage(`Failed to read database file ${uri.fsPath}: ${error.message}`)
        }
    }

    return db
}

export async function listDatabaseFiles(starRodDir: vscode.Uri): Promise<vscode.Uri[]> {
    const [major, minor, patch] = (await getStarRodDirVersion(starRodDir)).split('.').map(Number)
    const databasePath = minor >= 5 ? '/database/version/US' : '/database'

    const dirList = await vscode.workspace.fs.readDirectory(starRodDir.with({
        path: starRodDir.path + databasePath
    }))

    return dirList
        .filter(([name]) => name.endsWith('.lib'))
        .map(([name]) => starRodDir.with({ path: starRodDir.path + databasePath + '/' + name }))
}
