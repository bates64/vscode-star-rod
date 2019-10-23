// Makes lib.json

const fs = require('fs')

function parseFile(name) {
    const lines = fs.readFileSync(name, 'utf8').split(/\r?\n/)
    const out = []

    for (const line of lines) {
        if (line.startsWith('%')) continue

        let [ , name, argTypes, argNames ] = line.split(':').map(s => s.trim())

        if (!name) continue
        if (!argTypes) continue
        if (!argNames) continue

        if (!argTypes.endsWith('% args')) {
            // Unknown args
            out.push({ name })
            continue
        }

        // Given args, parse them
        argTypes = argTypes
            .replace(/%.*/, '')
            .split(',')
            .map(s => s.trim())

        argNames = argNames
            .replace(/--.*/, '')
            .split(',').map(s => s.trim())

        if (argTypes.length != argNames.length) {
            out.push({ name })
            continue
        }

        const args = argTypes
            .map((type, i) => ({ name: argNames[i], type }))

        out.push({ name, args })
    }

    return out
}

console.log(JSON.stringify({
    functions: [
        ...parseFile(__dirname + '/map_func_library.txt'),
        ...parseFile(__dirname + '/battle_func_library.txt'),
        ...parseFile(__dirname + '/shared_func_library.txt'),
    ],
}, null, 2))
