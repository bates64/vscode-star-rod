declare module 'fix-whitespace' {
    export default function fixWhitespace(
        literals: TemplateStringsArray,
        ...values: string[]
    ): string
}
