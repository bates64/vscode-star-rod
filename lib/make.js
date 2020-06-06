// Makes lib.json

const fs = require('fs')

// TODO: parseScriptLib

function parseFuncLib(fname, usage) {
    const lines = fs.readFileSync(fname, 'utf8').split(/\r?\n/)
    const out = []

    let inMultilineComment = false
    for (let line of lines) {
        if (inMultilineComment) {
            if (line.indexOf('%/') != -1) {
                line = line.substring(line.indexOf('%/') + 2)
                inMultilineComment = false
            } else {
                continue
            }
        } else if (line.indexOf('/%') != -1) {
            line = line.substring(0, line.indexOf('/%'))
            inMultilineComment = true
        }

        const lineNoComment = line.indexOf('%') == -1
            ? line
            : line.substring(0, line.indexOf('%')).trim()
        const comment = line.indexOf('%') == -1
        ? ''
        : line.substring(line.indexOf('%') + 1).trim()

        if (lineNoComment.length == 0) continue

        let [ address, name, argTypes ] = lineNoComment.split(':').map(s => s.trim())

        //address = parseInt(lineNoComment, 16)

        argTypes = argTypes
            .split(',')
            .map(s => s.trim())

        if (argTypes[0] === '*') {
            // Unknown args
            out.push({
                usage: name.startsWith('_') ? 'asm' : usage,
                ramAddress: address,
                name,
            })
        } else {
            let argNames = [], notes = ''

            if (comment.startsWith('args')) {
                let notesPos = comment.indexOf('--')
                if (notesPos == -1) {
                    notesPos = comment.length
                }

                notes = comment.substring(notesPos + 2).trim()
                const argNamesStr = comment.substring(
                    comment.indexOf(':') + 1,
                    notesPos,
                ).trim()

                let parens = 0, argNameBuf = ''
                for (let ch of argNamesStr) {
                    switch (ch) {
                        case '(': parens++; break
                        case ')': parens--; break
                        case ',': if (parens == 0) {
                            argNames.push(argNameBuf.trim())
                            argNameBuf = ''
                            continue
                        }
                    }
                    argNameBuf += ch
                }

                argNames.push(argNameBuf.trim())
            } else {
                notes = comment
            }

            if (argTypes.length == 1 && argTypes[0] == 'none') {
                argTypes = []
            }

            const cleanName = name => name?.split(' ')[0].replace(/[^A-Za-z0-9_*#?]/g, '')

            out.push({
                usage: name.startsWith('_') ? 'asm' : usage,
                ramAddress: address,
                name,
                args: argTypes.map((type, i) => ({
                    name: argNames[i] !== type ? cleanName(argNames[i]) : undefined,
                    attributes: {},
                    type,
                })),
                returns: usage === 'api' ? [] : undefined,
                note: notes,
                attributes: {},
            })
        }
    }

    return out
}

fs.writeFileSync(__dirname + '/../src/lib.json', JSON.stringify({
    world: [
        ...parseFuncLib(__dirname + '/map_func_library.txt', 'api'),
        //...parseScriptLib(__dirname + '/map_script_library.txt'),
    ],
    battle: [
        ...parseFuncLib(__dirname + '/battle_func_library.txt', 'api'),
        //...parseScriptLib(__dirname + '/battle_script_library.txt'),
    ],
    common: [
        ...parseFuncLib(__dirname + '/shared_func_library.txt', 'api'),
        ...parseFuncLib(__dirname + '/system_func_library.txt', 'asm'),
    ],
    pause: [],
}, null, 2))
