import * as vscode from 'vscode'
import * as libProvider from './libProvider'

const STAR_ROD_JAR_SIZES = new Map([
    // No other good way to check for SR version AFAIK.
    [14553447, '0.2.0'],
])

export async function activate(ctx: vscode.ExtensionContext) {
    libProvider.register()

    const config = vscode.workspace.getConfiguration()
    const installDir = config.get('starRod.installDirectory', '')

    if (!installDir) {
        const item = await vscode.window.showWarningMessage('Star Rod installation directory not set.', {},
            'Set Installation Directory...',
            'Download Star Rod',
        )

        await handleInstallPrompt(item)
    } else if (!(await getStarRodDirVersion(vscode.Uri.file(installDir)))) {
        const item = await vscode.window.showErrorMessage(`Star Rod installation directory "${installDir}" is invalid.`, {},
            'Set Installation Directory...',
            'Download Star Rod',
        )

        await handleInstallPrompt(item)
    }
}

async function handleInstallPrompt(item: string | undefined) {
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
        openLabel: 'Set Star Rod Directory'
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
                'The selected directory is not a known Star Rod installation directory.',
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

async function getStarRodDirVersion(dir: vscode.Uri): Promise<string | undefined> {
    const jar = dir.with({ path: dir.path + '/StarRod.jar' })

    try {
        const { size } = await vscode.workspace.fs.stat(jar)
        return STAR_ROD_JAR_SIZES.get(size)
    } catch {
        return undefined
    }
}
