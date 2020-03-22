import * as vscode from 'vscode'
import * as libProvider from './libProvider'

export async function activate(ctx: vscode.ExtensionContext) {
    libProvider.register()
}
