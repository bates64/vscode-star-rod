import * as vscode from 'vscode'
import * as libProvider from './libProvider'
import activateCommands from './commands'

const STAR_ROD_JAR_SIZES = new Map([
    // No other good way to check for SR version AFAIK.
    [14553447, '0.2.0'],
    [16028705, '0.3.0-beta0'],
])

export async function activate(ctx: vscode.ExtensionContext) {
    await libProvider.register()
    activateCommands(ctx)

    const installDir = getStarRodDir()
    if (!installDir) {
        const item = await vscode.window.showWarningMessage('Star Rod installation directory not set.', {},
            'Set Installation Directory...',
            'Download Star Rod',
        )

        await handleInstallPrompt(item)
    } else if (!(await getStarRodDirVersion(installDir))) {
        const item = await vscode.window.showErrorMessage(`Star Rod installation directory "${installDir}" is invalid.`, {},
            'Set Installation Directory...',
            'Download Star Rod',
        )

        await handleInstallPrompt(item)
    }
}

export async function handleInstallPrompt(item: string | undefined) {
    if (item === 'Set Installation Directory...') {
        setStarRodDir()
    } else if (item === 'Download Star Rod') {
        vscode.env.openExternal(vscode.Uri.parse('http://github.com/nanaian/star-rod/zipball/master'))

        const item = await vscode.window.showInformationMessage('Unzip the downloaded file, then click Set Installation Directory.', {},
            'Set Installation Directory...',
        )
        if (item === 'Set Installation Directory...') setStarRodDir()
    }
}

async function setStarRodDir(): Promise<boolean> {
    const uris = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: 'Select Star Rod Directory'
    })

    if (uris?.[0]) {
        const dir = uris[0]
        const srVersion = await getStarRodDirVersion(dir)

        if (srVersion) {
            const config = vscode.workspace.getConfiguration()
            config.update('starRod.installDirectory', dir.fsPath, true)

            return true
        } else {
            const item = await vscode.window.showErrorMessage(
                'The selected directory is not a known Star Rod 0.2+ installation directory.',
                { modal: true },
                'Set Installation Directory...',
                'Cancel'
            )

            if (item === 'Set Installation Directory...') {
                return setStarRodDir()
            }
        }
    }

    return false
}

export function getStarRodDir(): vscode.Uri | undefined {
    const config = vscode.workspace.getConfiguration()
    const installDir = config.get('starRod.installDirectory', '')

    try {
        if (installDir) return vscode.Uri.file(installDir)
        else return undefined
    } catch {
        return undefined
    }
}

export async function getStarRodDirVersion(dir: vscode.Uri | undefined = getStarRodDir()): Promise<string | undefined> {
    if (!dir) return undefined

    const jar = dir.with({ path: dir.path + '/StarRod.jar' })

    const config = vscode.workspace.getConfiguration()
    const override = config.get('starRod.installDirectoryVersionOverride', '')
    if (override) {
        return override
    }

    try {
        const { size } = await vscode.workspace.fs.stat(jar)
        return STAR_ROD_JAR_SIZES.get(size)
    } catch {
        return undefined
    }
}
