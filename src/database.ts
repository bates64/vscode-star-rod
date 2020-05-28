// Parser for *.lib version 1.0.
// For Star Rod 0.2.0, `lib.json` is used instead.

import * as vscode from 'vscode'

export type Database = {
    map: Entry[]
    battle: Entry[]
    common: Entry[]
}

export type Entry = {
    usage: 'api' | 'asm' | 'scr'
    ramAddress?: string
    romAddress?: string
    name: string
    note?: string
    args: Arg[]
    returns: Arg[]
}

export type Arg = {
    name: string
    type: string
    container?: string
    note?: string

    out: false
} | {
    name: string
    type: string
    container?: string
    note?: string

    out: true
    outType?: string
}

export default async function loadDatabase(starRodDir: vscode.Uri): Promise<Database> {
    const db: Database = {
        map: [],
        battle: [],
        common: [],
    }

    for (const uri of await listDatabaseFiles(starRodDir)) {
        const { scope, entries } = await readAndParse(uri)
        db[scope].push(...entries)
    }

    return db
}

export async function listDatabaseFiles(starRodDir: vscode.Uri): Promise<vscode.Uri[]> {
    const dirList = await vscode.workspace.fs.readDirectory(starRodDir.with({ path: starRodDir.path + '/database' }))

    return dirList
        .filter(([name]) => name.endsWith('.lib'))
        .map(([name]) => starRodDir.with({ path: starRodDir.path + '/database/' + name }))
}

async function readAndParse(uri: vscode.Uri): Promise<{ scope: keyof Database, entries: Entry[] }> {
    // TODO
    return { scope: 'common', entries: [] }
}
